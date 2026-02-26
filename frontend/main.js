document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded and parsed");

    if (typeof Wearable === 'undefined') {
        console.error("Wearable API not found. Please ensure you are on a device with the Wearable API.");
        return;
    }

    const dataClient = Wearable.getDataClient();

    dataClient.addListener("/epilepsy/telemetry", (data) => {
        const payload = JSON.parse(new TextDecoder().decode(data));
        console.log("Received telemetry:", payload);
        document.getElementById("heart-rate").textContent = payload.heartRate;
        document.getElementById("hrv").textContent = payload.hrv;
        document.getElementById("movement").textContent = payload.movement;
        document.getElementById("spo2").textContent = payload.spo2 ? payload.spo2.toFixed(1) : "--";
    });

    dataClient.addListener("/epilepsy/alert", (data) => {
        const payload = JSON.parse(new TextDecoder().decode(data));
        console.log("Received alert:", payload);
        const alertList = document.getElementById("alert-list");
        const alertDiv = document.createElement("div");
        alertDiv.classList.add("alert");
        alertDiv.innerHTML = `
            <h3>${payload.title}</h3>
            <p>${payload.message}</p>
            <p>Risk Level: ${payload.riskLevel}</p>
            <p>Risk Score: ${payload.riskScore}</p>
        `;
        alertList.prepend(alertDiv);
    });
});
