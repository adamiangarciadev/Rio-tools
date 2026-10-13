(function (root) {
  "use strict";
  const key = date => date.toISOString().slice(0, 10);
  const parse = value => new Date(value + "T12:00:00Z");
  function weekDates(selected) {
    const date = parse(selected);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return Array.from({ length: 6 }, (_, index) => { const day = new Date(date); day.setUTCDate(day.getUTCDate() + index); return key(day); });
  }
  function totals(rows) {
    const reported = rows.filter(row => row.amount != null);
    const sold = reported.reduce((sum, row) => sum + Number(row.amount), 0);
    const target = reported.reduce((sum, row) => sum + Number(row.target || 0), 0);
    return { sold, target, difference: sold - target, count: reported.length, percent: target > 0 ? sold / target * 100 : null };
  }
  function summarize(store, selected) {
    const dates = weekDates(selected);
    const byDate = new Map(store.monthPlan.map(row => [row.date, row]));
    const week = dates.map(date => byDate.get(date) || { date, outsideMonth: true, target: null, amount: null });
    const elapsed = store.monthPlan.filter(row => row.date <= selected);
    const month = totals(elapsed);
    const weekTotal = totals(week.filter(row => row.date <= selected));
    const missing = elapsed.filter(row => row.dayType !== "closed" && row.date < selected && row.amount == null).length;
    return { week, month, weekTotal, missing, today: byDate.get(selected) || null, goal: store.goal, monthPercent: store.goal > 0 ? month.sold / store.goal * 100 : null };
  }
  function demo() {
    const month = "2026-10", today = "2026-10-13";
    const examples = [{ id: "demo-centro", name: "Local Centro", base: 420000, rate: 1.09 }, { id: "demo-norte", name: "Local Norte", base: 350000, rate: .89 }, { id: "demo-sur", name: "Local Sur", base: 290000, rate: 1.025 }];
    return { role: "supervision", month, today, updatedAt: null, stores: examples.map((store, index) => {
      const monthPlan = Array.from({ length: 31 }, (_, i) => {
        const date = month + "-" + String(i + 1).padStart(2, "0"), dow = parse(date).getUTCDay();
        const target = dow === 0 ? 0 : Math.round(store.base * (dow === 6 ? 1.45 : 1));
        return { date, dayType: dow === 0 ? "closed" : dow === 6 ? "saturday" : "weekday", target, amount: date < today && dow !== 0 ? Math.round(target * (store.rate + ((i + index) % 5 - 2) * .025)) : null };
      });
      return { id: store.id, name: store.name, goal: monthPlan.reduce((sum, row) => sum + row.target, 0), monthPlan };
    }) };
  }
  const model = { weekDates, totals, summarize, demo };
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.RioObjectives = model;
})(typeof window === "object" ? window : globalThis);
