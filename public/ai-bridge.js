// public/ai-bridge.js

document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendMessageBtn"); // buton id
  const input = document.getElementById("partnerMessageInput"); // input id

  if (!sendBtn || !input) {
    console.error("AI Bridge: Input veya buton bulunamadı.");
    return;
  }

  sendBtn.addEventListener("click", async () => {
    const message = input.value.trim();
    if (!message) return;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          partnerGender: window.selectedGender || "unknown" // seçilen cinsiyeti buraya dinamik al
        })
      });

      const data = await res.json();
      console.log("AI response:", data);

      // Chatbox'a ekle
      const chatBox = document.getElementById("chatBox");
      if (chatBox) {
        const aiMsg = document.createElement("div");
        aiMsg.className = "ai-message";
        aiMsg.textContent = data.translation || "No AI response";
        chatBox.appendChild(aiMsg);
      }
    } catch (err) {
      console.error("AI request error:", err);
    }
  });
});
