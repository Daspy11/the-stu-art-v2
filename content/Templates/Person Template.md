---
active groups: 
inactive groups: 
relation to me: 
location: 
title: 
email: 
phone number: 
linkedin: 
summary: 
spouse: 
children: 
mother: 
father: 
aliases:
---
#person

# <% tp.file.title %>
<% await tp.file.move("People/" + tp.file.title) %>

## Notes
- 

## Meetings
```dataview
TABLE file.cday as Created, summary AS "Summary"
FROM "Meetings" where contains(file.outlinks, [[<% tp.file.title %>]])
SORT file.cday DESC
```

## Connected To
```dataview
TABLE title as "Title", company as "Company"
FROM "People" where contains(file.outlinks, [[<% tp.file.title %>]])
SORT file.cday DESC
```