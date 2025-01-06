---
created: 2023-10-24
updated: 2025-01-05
share: false
---
# <% moment(tp.file.title,'YYYY-MM-DD').format("dddd, MMMM DD, YYYY") %>

<%*
let baseDate = moment(tp.file.title, 'YYYY-MM-DD');
let pastLabel = 'Yesterday';
let futureLabel = 'Tomorrow';
let pastDateLink = 'Dailies/' + baseDate.clone().subtract(1, 'days').format('YYYY-MM-DD');
let futureDateLink = 'Dailies/' + baseDate.clone().add(1, 'days').format('YYYY-MM-DD');
for (let i = 2; i <= 14; i++) {
    let pastDate = baseDate.clone().subtract(i, 'days').format('YYYY-MM-DD');
    if (app.vault.getAbstractFileByPath('Dailies/' + pastDate + '.md')) {
        pastDateLink = 'Dailies/' + pastDate;
        pastLabel = `${i} days ago`;
        break;
    }
}
%> << [[<% pastDateLink %>|<% pastLabel %>]] | [[<% futureDateLink %>|<% futureLabel %>]] >>

---

<% tp.file.cursor() %>