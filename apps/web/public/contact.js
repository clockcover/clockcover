// Contact form → POST https://api.clockcover.com/contact. No framework; progressive: without JS the page still shows the email address.
(function () {
  var form = document.getElementById("contact");
  if (!form) return;
  var API = "https://api.clockcover.com/contact";
  var he = document.documentElement.lang === "he";
  var T = he
    ? { sending: "שולח…", sent: "נשלח. נחזור אליכם בהקדם.", invalid: "בדקו את השדות המסומנים.", failed: "לא נשלח. נסו שוב או כתבו לנו במייל." }
    : { sending: "Sending…", sent: "Sent. We'll get back to you shortly.", invalid: "Please check the highlighted fields.", failed: "Not sent. Try again or email us." };
  var status = form.querySelector(".status");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v); });
    form.querySelectorAll("[name]").forEach(function (el) { el.classList.remove("bad"); });
    status.textContent = T.sending;
    fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
      .then(function (res) { return res.json().then(function (body) { return { res: res, body: body }; }); })
      .then(function (r) {
        if (r.res.ok) { status.textContent = T.sent; form.reset(); return; }
        if (r.res.status === 400 && r.body && r.body.fields) {
          r.body.fields.forEach(function (f) { var el = form.querySelector('[name="' + f + '"]'); if (el) el.classList.add("bad"); });
          status.textContent = T.invalid; return;
        }
        status.textContent = T.failed;
      })
      .catch(function () { status.textContent = T.failed; });
  });
})();
