# Obsidian
#seed

## Essential plugins
- **Templater** - Run javascript in templates.
- **Dataview** - Queries.
- **Tasks** - Save tasks anywhere in any note by just writing a checkbox.
- **Homepage** - Self explanatory.
- **Image Toolkit** - Click to zoom on images. Should already be a thing.
- **QuickAdd** - Bind creating new templates to macros/hotkeys/the command palette.
- **Folder Note + Waypoint** - Create self-updating folder indexes that make the graph view nicer to look at.

## Personal cheatsheet

#### List Callouts

[[https://github.com/mgmeyers/obsidian-list-callouts|List Callouts Plugin - Github]]
- !  - `!` - Caution, danger
- ?? - `??` - Confusion, don't understand
- ? - `?` - Idea, maybe?
- $ - `$` Shopping list item (usually formatted as a task)
- q - `q` Quote

###### Debating
- rog - `rog` - Response to OG
- rcg - `rcg` - Response to CG
- roo - `roo` - Response to OO
- rco `rco` - Response to CO
- rg - `rg` - Response to Government
- ro - `ro` - Response to Opposition

#### Hotkeys
- `⌘ + P` - Command palette - add Person, Meeting, etc
- `⌘ + O` - Quick file switcher
- `⌘ + ⇧ + F` - Search text
- `⌘ + ↵` - Jump to next cursor location in template (custom)
- `⌘ + ⌥ + I` - Open inspector

#### Templater
-  `<% tp.file.cursor(1) %>` - Set cursor on apply
- Basic implementation:
```
  this is a template
```

## CSS Snippets

*Reminder: to set a custom CSS class on a page, use the `cssclasses` property*

### Full-width notes
I want some of my notes, especially those that are navigational or for summaries, to use the full width of the container while preserving the normal width for all others. 

```css
.w-full {
    --line-width: 999rem !important;
    --file-line-width: 999rem !important;
    max-width: 99999px !important;
}
```

#### Prettier tasks
The default tasks dataview renderer is ugly as hell. This makes it a big nicer to work with

```css
li.plugin-tasks-list-item span.tasks-backlink .internal-link::after {
  content: "Source";
  font-size: 0.5rem;
  padding: 2px 5px 2px 5px;
  margin-left: 5px;
  border-radius: 15px;
  background-color: var(--text-faint);
  opacity: 0.6;
  color: var(--text-normal);
}

li.plugin-tasks-list-item span.tasks-backlink {
    font-size: 0px;
}

li.plugin-tasks-list-item span.tasks-backlink > a {
    font-size: 0px;
}

li.plugin-tasks-list-item span.task-due, li.plugin-tasks-list-item span.task-done  {
    font-size: 0.5rem;
    padding: 2px 5px 2px 5px;
    margin-left: 5px;
    border-radius: 15px;
    background-color: var(--text-faint);
    opacity: 0.6;
}

li.plugin-tasks-list-item .task-description {
    font-size: 0.85rem;
}

li.plugin-tasks-list-item .tasks-edit {
  mask-size: 65% !important;
  -webkit-mask-size: 65% !important;
  mask-repeat: no-repeat !important;
  -webkit-mask-repeat: no-repeat !important;
  mask-position: center !important;
  -webkit-mask-position: center !important;
  opacity: 0.5 !important;
}
```

### Dashboards
Add the dashboard class to a page and it will rearrange itself into multiple columns to create a navigational aid.

- *[[https://archive.is/LkWRV|Dashboard++ — a simple organization and navigation method for Obsidian Vaults - Medium]]*
- [[https://github.com/TfTHacker/DashboardPlusPlus/blob/master/.obsidian/snippets/dashboard.css|Github Snippet]]

To create a dashboard, just implement a nested list.

> [!example]
> - Heading
>   - Link1
>   - Link2
> - Heading2
>   - Link3
>   - Link4