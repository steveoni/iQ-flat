function saveCredentials() {
  const endpoint = document.getElementById("apiEndpoint").value.trim();
  const key = document.getElementById("apiKey").value.trim();
  const statusDiv = document.getElementById("status");

  chrome.storage.sync.set({ endpoint, key }, () => {
    statusDiv.textContent = "Credentials saved!";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 2000);
  });
}

document.getElementById("saveBtn").addEventListener("click", saveCredentials);

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(["endpoint", "key"], (result) => {
    if (result.endpoint)
      document.getElementById("apiEndpoint").value = result.endpoint;
    if (result.key) document.getElementById("apiKey").value = result.key;
  });
});
