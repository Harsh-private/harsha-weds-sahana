/* Shared helpers for the invitation pages: calendar files, countdown maths, play videos only while visible. */
window.HS = (() => {
  const START = Date.parse('2026-11-26T04:30:00+05:30');
  const EV = {
    reception: { s: '20261125T133000Z', t: 'Harsha & Sahana · Reception & Dinner' },
    wedding: { s: '20261125T230000Z', e: '20261126T000000Z', t: 'Harsha & Sahana · Wedding Muhurtham' }
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function ics(key) {
    const v = EV[key];
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hs//EN', 'BEGIN:VEVENT', 'UID:' + key + '@harsha-sahana', 'DTSTAMP:20261101T000000Z', 'DTSTART:' + v.s]
      .concat(v.e ? ['DTEND:' + v.e] : [])
      .concat(['SUMMARY:' + v.t, 'LOCATION:S J R Function Hall\\, Bangalore Road\\, Anantapur', 'END:VEVENT', 'END:VCALENDAR']);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    a.download = key + '.ics'; document.body.append(a); a.click(); a.remove();
  }
  function bindCalendar(doneText) {
    document.querySelectorAll('[data-ics]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); ics(b.dataset.ics); if (doneText) b.textContent = doneText; b.classList.add('done');
    }));
  }
  function parts() { const m = Math.max(0, Math.floor((START - Date.now()) / 60000)); return { d: Math.floor(m / 1440), h: Math.floor(m % 1440 / 60), m: m % 60 }; }
  function days() { return Math.max(0, Math.ceil((START - Date.now()) / 864e5)); }
  function playOnView(sel = 'video', threshold = .3) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !reduce) e.target.play().catch(() => {}); else e.target.pause(); }), { threshold });
    document.querySelectorAll(sel).forEach(v => io.observe(v));
  }
  const MAPS = 'https://www.google.com/maps/search/?api=1&query=S%20J%20R%20Function%20Hall%2C%20Bangalore%20Road%2C%20Anantapur%20Town';
  return { ics, bindCalendar, parts, days, playOnView, reduce, MAPS, START };
})();
