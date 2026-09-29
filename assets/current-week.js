(() => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  function updateCurrentWeek() {
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    document.querySelectorAll('.course-table tbody tr').forEach(row => {
      const { dateStart: start, dateEnd: end } = row.dataset;
      const current = Boolean(start && end && start <= today && today <= end);
      row.classList.toggle('current-week', current);
      if (current) row.setAttribute('aria-current', 'date');
      else row.removeAttribute('aria-current');
    });
  }
  updateCurrentWeek();
  // Refresh a page left open across midnight or restored from the browser cache.
  setInterval(updateCurrentWeek, 60000);
  window.addEventListener('pageshow', updateCurrentWeek);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateCurrentWeek();
  });
})();
