---
updated: <% tp.date.now() %>
created: <% tp.date.now() %>
share: false
---
#seed

<%*
const title = await tp.system.prompt("Enter the title");

async function tryRename(filename) {
    try {
        await tp.file.rename(filename);
    } catch (error) {
        const newFilename = await tp.system.prompt(
            `Error: ${error.message}\nPlease enter a different filename:`
        );
        if (newFilename) {
            return await tryRename(newFilename);
        }
    }
}

await tryRename(title);
%>

# <% title %>

<% tp.file.cursor(0) %>