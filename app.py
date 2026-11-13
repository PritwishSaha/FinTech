"""
====================================================
CREDIT CARD FRAUD DETECTION
Flask Web Application + REST API
====================================================

Model: Random Forest Classifier
Decision Threshold: 0.50

Dataset: Synthetic Credit Card Transactions
====================================================
"""

import os
import joblib
import numpy as np
import pandas as pd

from flask import Flask, request, jsonify, render_template


# ==================================================
# 1. APPLICATION CONFIGURATION
# ==================================================

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "final_fraud_detection_model.pkl"
)

# Limit incoming request size
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


# ==================================================
# 2. LOAD TRAINED MODEL
# ==================================================

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file not found: {MODEL_PATH}"
    )

model_package = joblib.load(MODEL_PATH)

model = model_package["model"]
scaler = model_package["scaler"]

THRESHOLD = float(model_package["threshold"])

NUMERICAL_FEATURES = model_package["numerical_features"]
ALL_FEATURES = model_package["all_features"]

MODEL_NAME = model_package.get(
    "model_name",
    "Random Forest Classifier"
)


# ==================================================
# 3. INPUT CONFIGURATION
# ==================================================

REQUIRED_FIELDS = [
    "amount",
    "transaction_hour",
    "merchant_category",
    "foreign_transaction",
    "location_mismatch",
    "device_trust_score",
    "velocity_last_24h",
    "cardholder_age"
]

VALID_MERCHANTS = [
    "Food",
    "Clothing",
    "Travel",
    "Grocery",
    "Electronics"
]


# ==================================================
# 4. INPUT VALIDATION FUNCTIONS
# ==================================================

def parse_integer(value, field_name):

    if isinstance(value, bool):
        raise ValueError(
            f"{field_name} must be an integer."
        )

    try:
        numeric_value = float(value)

    except (ValueError, TypeError):
        raise ValueError(
            f"{field_name} must be a valid number."
        )

    if not np.isfinite(numeric_value):
        raise ValueError(
            f"{field_name} must be finite."
        )

    if not numeric_value.is_integer():
        raise ValueError(
            f"{field_name} must be an integer."
        )

    return int(numeric_value)


def validate_transaction(data):

    if not isinstance(data, dict):
        raise ValueError(
            "Request must contain a JSON object."
        )

    # Check missing fields
    missing_fields = [
        field
        for field in REQUIRED_FIELDS
        if field not in data
    ]

    if missing_fields:
        raise ValueError(
            f"Missing required fields: {missing_fields}"
        )

    # Parse amount
    if isinstance(data["amount"], bool):
        raise ValueError(
            "Amount must be a valid number."
        )

    try:
        amount = float(data["amount"])

    except (ValueError, TypeError):
        raise ValueError(
            "Amount must be a valid number."
        )

    if not np.isfinite(amount):
        raise ValueError(
            "Amount must be finite."
        )

    # Parse integer fields
    hour = parse_integer(
        data["transaction_hour"],
        "Transaction hour"
    )

    foreign = parse_integer(
        data["foreign_transaction"],
        "Foreign transaction"
    )

    mismatch = parse_integer(
        data["location_mismatch"],
        "Location mismatch"
    )

    trust = parse_integer(
        data["device_trust_score"],
        "Device trust score"
    )

    velocity = parse_integer(
        data["velocity_last_24h"],
        "Velocity"
    )

    age = parse_integer(
        data["cardholder_age"],
        "Cardholder age"
    )

    merchant = str(data["merchant_category"]).strip()
    merchant = merchant.title()

    # Amount validation
    if amount < 0:
        raise ValueError(
            "Amount cannot be negative."
        )

    # Transaction hour validation
    if not 0 <= hour <= 23:
        raise ValueError(
            "Transaction hour must be between 0 and 23."
        )

    # Binary feature validation
    if foreign not in [0, 1]:
        raise ValueError(
            "foreign_transaction must be 0 or 1."
        )

    if mismatch not in [0, 1]:
        raise ValueError(
            "location_mismatch must be 0 or 1."
        )

    # Device trust validation
    if not 0 <= trust <= 100:
        raise ValueError(
            "Device trust score must be between 0 and 100."
        )

    # Transaction velocity validation
    if not 0 <= velocity <= 9:
        raise ValueError(
            "Velocity must be between 0 and 9."
        )

    # Age validation
    if not 18 <= age <= 69:
        raise ValueError(
            "Cardholder age must be between 18 and 69."
        )

    # Merchant validation
    if not isinstance(merchant, str):
        raise ValueError(
            "Merchant category must be text."
        )

    if merchant not in VALID_MERCHANTS:
        raise ValueError(
            "Invalid merchant category."
        )

    # Feature engineering
    hour_sin = np.sin(
        2 * np.pi * hour / 24
    )

    hour_cos = np.cos(
        2 * np.pi * hour / 24
    )

    return {
        "amount": amount,
        "merchant_category": merchant,
        "foreign_transaction": foreign,
        "location_mismatch": mismatch,
        "device_trust_score": trust,
        "velocity_last_24h": velocity,
        "cardholder_age": age,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos
    }


# ==================================================
# 5. FRONTEND HOME PAGE
# ==================================================

@app.route("/", methods=["GET"])
def home():

    return render_template("index.html")


# ==================================================
# 6. HEALTH CHECK API
# ==================================================

@app.route("/health", methods=["GET"])
def health():

    return jsonify({
        "application": "Credit Card Fraud Detection",
        "model": MODEL_NAME,
        "status": "Healthy",
        "model_loaded": model is not None,
        "threshold": THRESHOLD
    }), 200


# ==================================================
# 7. FRAUD PREDICTION API
# ==================================================

@app.route("/predict", methods=["POST"])
def predict():

    try:

        # Read JSON request
        data = request.get_json(silent=True)

        if data is None:
            return jsonify({
                "error": "A valid JSON request body is required."
            }), 400

        # Validate and prepare transaction
        transaction = validate_transaction(data)

        # Create model input DataFrame using the raw feature layout used during
        # training. The saved model already contains its preprocessing pipeline,
        # so scaling the numerical columns here can distort the probability
        # estimates and produce incorrect predictions.
        input_df = pd.DataFrame(
            [transaction],
            columns=ALL_FEATURES
        )

        try:
            fraud_probability = float(
                model.predict_proba(input_df)[0, 1]
            )
        except Exception:
            # Backward compatibility: if the model was trained with an
            # external scaler, apply it only as a fallback.
            input_scaled = input_df.copy()

            if NUMERICAL_FEATURES:
                input_scaled[NUMERICAL_FEATURES] = (
                    scaler.transform(
                        input_df[NUMERICAL_FEATURES]
                    )
                )

            fraud_probability = float(
                model.predict_proba(input_scaled)[0, 1]
            )

        # Apply decision threshold
        prediction = int(
            fraud_probability >= THRESHOLD
        )

        # Prepare API response
        result = {
            "application": "Credit Card Fraud Detection",
            "prediction": prediction,
            "status": (
                "FRAUD"
                if prediction == 1
                else "LEGITIMATE"
            ),
            "fraud_probability": round(
                fraud_probability, 6
            ),
            "threshold": THRESHOLD,
            "model": MODEL_NAME
        }

        return jsonify(result), 200

    except ValueError as error:

        return jsonify({
            "error": str(error)
        }), 400

    except Exception:

        app.logger.exception(
            "Fraud prediction failed."
        )

        return jsonify({
            "error": "An internal prediction error occurred."
        }), 500


# ==================================================
# 8. INVALID ROUTE HANDLING
# ==================================================

@app.errorhandler(404)
def page_not_found(error):

    return jsonify({
        "error": "Requested endpoint was not found."
    }), 404


@app.errorhandler(405)
def method_not_allowed(error):

    return jsonify({
        "error": "HTTP method not allowed."
    }), 405


# ==================================================
# 9. RUN APPLICATION
# ==================================================

if __name__ == "__main__":

    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )