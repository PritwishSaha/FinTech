/* =====================================================
   FinTech - FRONTEND APPLICATION
   Flask API Integration (/health, /predict)
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

    // ================================================
    // HELPERS
    // ================================================

    const $ = (id) => document.getElementById(id);

    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    // ================================================
    // DOM ELEMENTS
    // ================================================

    const transactionForm = $("transactionForm");
    const analyzeButton = $("analyzeButton");

    const resultPanel = $("resultPanel");
    const emptyResult = $("emptyResult");
    const loadingResult = $("loadingResult");
    const analysisResult = $("analysisResult");
    const errorResult = $("errorResult");

    const historyTable = $("historyTable");

    const totalTransactions = $("totalTransactions");
    const fraudCount = $("fraudCount");
    const legitimateCount = $("legitimateCount");
    const fraudRate = $("fraudRate");

    const legitimateBar = $("legitimateBar");
    const fraudBar = $("fraudBar");

    const legitimatePercentage = $("legitimatePercentage");
    const fraudPercentage = $("fraudPercentage");

    const scoreTrail = $("scoreTrail");
    const trailEmpty = $("trailEmpty");

    const clearHistoryButton = $("clearHistory");

    const heroVisual = $("heroVisual");
    const heroCard = $("heroCard");
    const heroStamp = $("heroStamp");

    // ================================================
    // SESSION DATA
    // ================================================

    let transactions = [];

    // ================================================
    // INITIALIZATION
    // ================================================

    updateDate();
    setupSliders();
    updateDashboard();
    renderHistory();
    checkServerStatus();
    setupNavHighlight();
    setupReveal();
    setupCardTilt();

    // ================================================
    // DATE DISPLAY
    // ================================================

    function updateDate() {

        const dateElement = $("currentDate");

        if (!dateElement) {
            return;
        }

        dateElement.textContent = new Date()
            .toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            })
            .toUpperCase();

    }

    // ================================================
    // SERVER STATUS
    // ================================================

    async function checkServerStatus() {

        const dots = document.querySelectorAll(".status-dot");
        const navText = $("navStatusText");
        const engine = $("engineStatus");

        const setState = (online) => {

            dots.forEach(dot => {
                dot.dataset.state = online ? "ok" : "down";
            });

            if (navText) {
                navText.textContent = online
                    ? "Engine online"
                    : "Engine offline";
            }

            if (engine) {
                engine.textContent = online ? "Operational" : "Offline";
                engine.classList.toggle("is-down", !online);
            }

        };

        try {

            const response = await fetch("/health");

            if (!response.ok) {
                throw new Error("Server unavailable");
            }

            const data = await response.json();

            if (!data.model_loaded) {
                throw new Error("Model not loaded");
            }

            setState(true);

            console.log("FinTech API connected successfully.");

        } catch (error) {

            setState(false);

            console.error("API connection failed:", error.message);

        }

    }

    // ================================================
    // SLIDERS (kept in sync with number inputs)
    // ================================================

    function setupSliders() {

        document
            .querySelectorAll("input[type='range'][data-sync]")
            .forEach(range => {

                const number = $(range.dataset.sync);

                if (!number) {
                    return;
                }

                const min = Number(range.min);
                const max = Number(range.max);

                const paint = () => {

                    const pct =
                        ((Number(range.value) - min) / (max - min)) * 100;

                    range.style.setProperty("--pct", `${pct}%`);

                };

                range.addEventListener("input", () => {

                    number.value = range.value;

                    paint();

                });

                number.addEventListener("input", () => {

                    if (number.value !== "") {

                        range.value = Math.min(
                            max,
                            Math.max(min, Number(number.value))
                        );

                    }

                    paint();

                });

                paint();

            });

    }

    // ================================================
    // FORM SUBMISSION
    // ================================================

    function getChoice(name) {

        const checked = transactionForm.querySelector(
            `input[name="${name}"]:checked`
        );

        return checked ? checked.value : "";

    }

    transactionForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        if (!transactionForm.reportValidity()) {
            return;
        }

        const transactionData = {

            amount: Number($("amount").value),

            transaction_hour: Number($("transaction_hour").value),

            merchant_category: getChoice("merchant_category"),

            foreign_transaction: Number(getChoice("foreign_transaction")),

            location_mismatch: Number(getChoice("location_mismatch")),

            device_trust_score: Number($("device_trust_score").value),

            velocity_last_24h: Number($("velocity_last_24h").value),

            cardholder_age: Number($("cardholder_age").value)

        };

        await analyzeTransaction(transactionData);

    });

    // ================================================
    // ANALYZE TRANSACTION
    // ================================================

    async function analyzeTransaction(transactionData) {

        showLoading();

        analyzeButton.disabled = true;
        analyzeButton.querySelector("span").textContent = "Analyzing...";

        try {

            const response = await fetch("/predict", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(transactionData)

            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Prediction failed.");
            }

            displayResult(result);

            saveTransaction(transactionData, result);

        } catch (error) {

            showError(error.message);

        } finally {

            analyzeButton.disabled = false;
            analyzeButton.querySelector("span").textContent =
                "Analyze Transaction";

        }

    }

    // ================================================
    // RESULT DISPLAY
    // ================================================

    function displayResult(result) {

        emptyResult.classList.add("hidden");
        loadingResult.classList.add("hidden");
        errorResult.classList.add("hidden");

        analysisResult.classList.remove("hidden");

        const isFraud = Number(result.prediction) === 1;

        const probability = Number(result.fraud_probability);

        const percentage = Math.max(
            0,
            Math.min(100, (Number.isFinite(probability) ? probability : 0) * 100)
        );

        let threshold = Number(result.threshold);

        if (!Number.isFinite(threshold)) {
            threshold = 0.5;
        }

        const statusElement = $("resultStatus");
        const riskPercentage = $("riskPercentage");
        const resultTitle = $("resultTitle");
        const resultDescription = $("resultDescription");

        const meterFill = $("meterFill");
        const meterNeedle = $("meterNeedle");
        const meterThreshold = $("meterThreshold");

        // Reset previous styling

        statusElement.classList.remove("fraud");
        meterFill.classList.remove("fraud");

        resultPanel.classList.toggle("is-fraud", isFraud);

        // Status + copy

        if (isFraud) {

            statusElement.textContent = "⚠ FRAUD DETECTED";

            statusElement.classList.add("fraud");

            meterFill.classList.add("fraud");

            resultTitle.textContent = "Suspicious Transaction";

            resultDescription.textContent =
                "The model classified this transaction as potentially fraudulent. Further verification is recommended.";

        } else {

            statusElement.textContent = "✓ LEGITIMATE";

            resultTitle.textContent = "Transaction Appears Legitimate";

            resultDescription.textContent =
                "The model classified this transaction as legitimate. This does not guarantee that the transaction is risk-free.";

        }

        // Stamp slam (restart the animation)

        statusElement.classList.remove("slam");
        void statusElement.offsetWidth;
        statusElement.classList.add("slam");

        // Animated score + risk meter

        riskPercentage.textContent = "0%";

        meterFill.style.width = "0%";
        meterNeedle.style.left = "0%";
        meterThreshold.style.left =
            `${Math.max(0, Math.min(100, threshold * 100))}%`;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                meterFill.style.width = `${percentage}%`;
                meterNeedle.style.left = `${percentage}%`;
            });
        });

        animateNumber(riskPercentage, percentage);

        // Model details

        $("resultModel").textContent = result.model || "Random Forest";

        $("resultThreshold").textContent = threshold.toFixed(2);

        // Hero card reacts to the verdict

        if (heroCard && heroStamp) {

            heroCard.dataset.state = isFraud ? "fraud" : "safe";

            heroStamp.textContent = isFraud ? "FLAGGED" : "CLEARED";

        }

    }

    // ================================================
    // NUMBER ANIMATION
    // ================================================

    function animateNumber(element, target) {

        if (reduceMotion) {
            element.textContent = `${target.toFixed(1)}%`;
            return;
        }

        const duration = 900;

        const startTime = performance.now();

        function update(currentTime) {

            const progress = Math.min(
                (currentTime - startTime) / duration,
                1
            );

            const easedProgress = 1 - Math.pow(1 - progress, 3);

            element.textContent =
                `${(target * easedProgress).toFixed(1)}%`;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = `${target.toFixed(1)}%`;
            }

        }

        requestAnimationFrame(update);

    }

    // ================================================
    // LOADING STATE
    // ================================================

    function showLoading() {

        emptyResult.classList.add("hidden");
        analysisResult.classList.add("hidden");
        errorResult.classList.add("hidden");

        loadingResult.classList.remove("hidden");

    }

    // ================================================
    // ERROR STATE
    // ================================================

    function showError(message) {

        emptyResult.classList.add("hidden");
        loadingResult.classList.add("hidden");
        analysisResult.classList.add("hidden");

        errorResult.classList.remove("hidden");

        $("errorMessage").textContent =
            message || "Something went wrong.";

    }

    // ================================================
    // SAVE TRANSACTION
    // ================================================

    function saveTransaction(transactionData, result) {

        const prediction = Number(result.prediction);

        const transaction = {

            id: `TXN-${Date.now()}`,

            amount: transactionData.amount,

            merchant: transactionData.merchant_category,

            probability: Number(result.fraud_probability) || 0,

            prediction: prediction,

            status: result.status || (prediction === 1 ? "Fraud" : "Legitimate"),

            time: new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            })

        };

        transactions.unshift(transaction);

        updateDashboard();

        renderHistory(true);

    }

    // ================================================
    // DASHBOARD STATISTICS
    // ================================================

    function setStat(element, value) {

        const text = String(value);

        if (element.textContent === text) {
            return;
        }

        element.textContent = text;

        if (!reduceMotion) {
            element.classList.remove("bump");
            void element.offsetWidth;
            element.classList.add("bump");
        }

    }

    function updateDashboard() {

        const total = transactions.length;

        const frauds = transactions.filter(
            item => item.prediction === 1
        ).length;

        const legitimate = total - frauds;

        const fraudPercentageValue =
            total > 0 ? (frauds / total) * 100 : 0;

        const legitimatePercentageValue =
            total > 0 ? (legitimate / total) * 100 : 0;

        setStat(totalTransactions, total);

        setStat(fraudCount, frauds);

        setStat(legitimateCount, legitimate);

        setStat(fraudRate, `${fraudPercentageValue.toFixed(1)}%`);

        legitimateBar.style.width = `${legitimatePercentageValue}%`;

        fraudBar.style.width = `${fraudPercentageValue}%`;

        legitimatePercentage.textContent =
            `${legitimatePercentageValue.toFixed(1)}%`;

        fraudPercentage.textContent =
            `${fraudPercentageValue.toFixed(1)}%`;

        renderTrail();

    }

    // ================================================
    // SCORE TRAIL (last 16 fraud scores, oldest -> newest)
    // ================================================

    function renderTrail() {

        scoreTrail.innerHTML = "";

        const recent = transactions.slice(0, 16).reverse();

        trailEmpty.classList.toggle("hidden", recent.length > 0);

        recent.forEach(transaction => {

            const bar = document.createElement("div");

            const pct = Math.max(
                3,
                Math.min(100, transaction.probability * 100)
            );

            bar.className = transaction.prediction === 1
                ? "trail-bar fraud"
                : "trail-bar";

            bar.style.height = `${pct}%`;

            bar.title =
                `${transaction.id} - ${(transaction.probability * 100).toFixed(1)}%`;

            scoreTrail.appendChild(bar);

        });

    }

    // ================================================
    // TRANSACTION HISTORY
    // ================================================

    function renderHistory(highlightNewest = false) {

        historyTable.innerHTML = "";

        if (transactions.length === 0) {

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.className = "empty-history";
            cell.textContent = "No transactions analyzed yet.";

            row.appendChild(cell);
            historyTable.appendChild(row);

            return;

        }

        transactions.forEach((transaction, rowIndex) => {

            const isFraud = transaction.prediction === 1;

            const row = document.createElement("tr");

            if (highlightNewest && rowIndex === 0) {
                row.className = "fresh";
            }

            // 1. ID

            const idCell = document.createElement("td");
            const idText = document.createElement("span");

            idText.className = "txn-id";
            idText.textContent = transaction.id;

            idCell.appendChild(idText);

            // 2. Amount

            const amountCell = document.createElement("td");
            const amountText = document.createElement("span");

            amountText.className = "amount";
            amountText.textContent =
                `₹${transaction.amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`;

            amountCell.appendChild(amountText);

            // 3. Merchant

            const merchantCell = document.createElement("td");
            merchantCell.textContent = transaction.merchant;

            // 4. Fraud score (+ mini bar)

            const scoreCell = document.createElement("td");
            const scoreWrap = document.createElement("span");
            const mini = document.createElement("span");
            const miniFill = document.createElement("i");
            const scoreText = document.createElement("span");

            scoreWrap.className = "score-cell";
            mini.className = "mini";

            miniFill.style.width =
                `${Math.max(0, Math.min(100, transaction.probability * 100))}%`;

            if (isFraud) {
                miniFill.className = "fraud";
            }

            scoreText.textContent =
                `${(transaction.probability * 100).toFixed(1)}%`;

            mini.appendChild(miniFill);
            scoreWrap.appendChild(mini);
            scoreWrap.appendChild(scoreText);
            scoreCell.appendChild(scoreWrap);

            // 5. Status badge

            const statusCell = document.createElement("td");
            const badge = document.createElement("span");

            badge.className = isFraud
                ? "table-status danger"
                : "table-status safe";

            badge.textContent = transaction.status;

            statusCell.appendChild(badge);

            // 6. Time

            const timeCell = document.createElement("td");
            timeCell.textContent = transaction.time;

            [
                idCell,
                amountCell,
                merchantCell,
                scoreCell,
                statusCell,
                timeCell
            ].forEach(cell => row.appendChild(cell));

            historyTable.appendChild(row);

        });

    }

    // ================================================
    // CLEAR HISTORY
    // ================================================

    clearHistoryButton.addEventListener("click", () => {

        if (transactions.length === 0) {
            return;
        }

        const confirmed = confirm(
            "Are you sure you want to clear transaction history?"
        );

        if (!confirmed) {
            return;
        }

        transactions = [];

        updateDashboard();

        renderHistory();

        emptyResult.classList.remove("hidden");
        loadingResult.classList.add("hidden");
        analysisResult.classList.add("hidden");
        errorResult.classList.add("hidden");

        resultPanel.classList.remove("is-fraud");

        if (heroCard && heroStamp) {

            heroCard.dataset.state = "idle";

            heroStamp.textContent = "READY";

        }

    });

    // ================================================
    // NAVIGATION HIGHLIGHT (follows scroll position)
    // ================================================

    function setupNavHighlight() {

        const links = document.querySelectorAll(".nav-link");

        const sections = ["overview", "analyzer", "analytics", "history", "team"]
            .map(id => $(id))
            .filter(Boolean);

        const setActive = (id) => {

            links.forEach(link => {

                link.classList.toggle(
                    "active",
                    link.getAttribute("href") === `#${id}`
                );

            });

        };

        links.forEach(link => {

            link.addEventListener("click", () => {
                setActive(link.getAttribute("href").slice(1));
            });

        });

        if (!("IntersectionObserver" in window)) {
            return;
        }

        const observer = new IntersectionObserver(entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {
                    setActive(entry.target.id);
                }

            });

        }, {
            rootMargin: "-40% 0px -55% 0px"
        });

        sections.forEach(section => observer.observe(section));

    }

    // ================================================
    // REVEAL ON SCROLL
    // ================================================

    function setupReveal() {

        const items = document.querySelectorAll(".reveal");

        if (!("IntersectionObserver" in window) || reduceMotion) {

            items.forEach(item => item.classList.add("in"));

            return;

        }

        const observer = new IntersectionObserver((entries, obs) => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("in");

                    obs.unobserve(entry.target);

                }

            });

        }, {
            threshold: 0.12
        });

        items.forEach(item => observer.observe(item));

    }

    // ================================================
    // HERO CARD TILT
    // ================================================

    function setupCardTilt() {

        if (!heroVisual || !heroCard) {
            return;
        }

        if (
            reduceMotion ||
            !window.matchMedia("(pointer: fine)").matches
        ) {
            return;
        }

        heroVisual.addEventListener("mousemove", (event) => {

            const rect = heroVisual.getBoundingClientRect();

            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;

            heroCard.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
            heroCard.style.setProperty("--ry", `${(x * 18).toFixed(2)}deg`);

        });

        heroVisual.addEventListener("mouseleave", () => {

            heroCard.style.setProperty("--rx", "0deg");
            heroCard.style.setProperty("--ry", "0deg");

        });

    }

});