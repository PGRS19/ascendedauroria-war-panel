
const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/login.html";
}

fetch("/api/xp", {
  headers: { Authorization: token }
})
.then(r => r.json())
.then(data => {
  let html = "<tr><th>Player</th><th>XP</th><th>Date</th></tr>";
  data.forEach(r => {
    html += `<tr><td>${r.player}</td><td>${r.xp}</td><td>${r.collected_at}</td></tr>`;
  });
  document.getElementById("xpTable").innerHTML = html;
});

function logout() {
  localStorage.removeItem("token");
  window.location.href = "/login.html";
}
