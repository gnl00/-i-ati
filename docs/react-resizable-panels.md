react-resizable-panels
React components for resizable panel groups/layouts.

Support
If you like this project there are several ways to support it:

Become a GitHub sponsor
or buy me a coffee
Installation
Begin by installing the library from NPM:

npm install react-resizable-panels
TypeScript types
TypeScript definitions are included within the published dist folder

Documentation
Documentation for this project is available at react-resizable-panels.vercel.app.

Group
A Group wraps a set of resizable Panel components. Group content can be resized horizontally or vertically.

Group elements always include the following attributes:

<div data-group data-testid="group-id-prop" id="group-id-prop">
ℹ️ Test id can be used to narrow selection when unit testing.

Required props
None

Optional props
Name	Description
className	
CSS class name.

id	
Uniquely identifies this group within an application. Falls back to useId when not provided.

ℹ️ This value will also be assigned to the data-group attribute.

style	
CSS properties.

⚠️ The following styles cannot be overridden: display, flex-direction, flex-wrap, and overflow.

children	
Panel and Separator components that comprise this group.

defaultLayout	
Default layout for the Group.

ℹ️ This value allows layouts to be remembered between page reloads.

⚠️ Refer to the documentation for how to avoid layout shift when using server components.

disableCursor	
This library sets custom mouse cursor styles to indicate drag state. Use this prop to disable that behavior for Panels and Separators in this group.

disabled	
Disable resize functionality.

elementRef	
Ref attached to the root HTMLDivElement.

groupRef	
Exposes the following imperative API:

getLayout(): Layout
setLayout(layout: Layout): void
ℹ️ The useGroupRef and useGroupCallbackRef hooks are exported for convenience use in TypeScript projects.

onLayoutChange	
Called when panel sizes change; receives a map of Panel id to size.

orientation	
Specifies the resizable orientation ("horizontal" or "vertical"); defaults to "horizontal"

Panel
A Panel wraps resizable content and can be configured with min/max size constraints and collapsible behavior.

Panel size props can be in the following formats:

Percentage of the parent Group (0..100)
Pixels
Relative font units (em, rem)
Viewport relative units (vh, vw)
ℹ️ Numeric values are assumed to be pixels. Strings without explicit units are assumed to be percentages (0%..100%). Percentages may also be specified as strings ending with "%" (e.g. "33%") Pixels may also be specified as strings ending with the unit "px". Other units should be specified as strings ending with their CSS property units (e.g. 1rem, 50vh)

Panel elements always include the following attributes:

<div data-panel data-testid="panel-id-prop" id="panel-id-prop">
ℹ️ Test id can be used to narrow selection when unit testing.

Required props
None

Optional props
Name	Description
className	
CSS class name.

⚠️ Class is applied to nested HTMLDivElement to avoid styles that interfere with Flex layout.

id	
Uniquely identifies this panel within the parent group. Falls back to useId when not provided.

ℹ️ This prop is used to associate persisted group layouts with the original panel.

ℹ️ This value will also be assigned to the data-panel attribute.

style	
CSS properties.

⚠️ Style is applied to nested HTMLDivElement to avoid styles that interfere with Flex layout.

collapsedSize	
Panel size when collapsed; defaults to 0%.

collapsible	
This panel can be collapsed.

ℹ️ A collapsible panel will collapse when it's size is less than of the specified minSize

defaultSize	
Default size of Panel within its parent group; default is auto-assigned based on the total number of Panels.

elementRef	
Ref attached to the root HTMLDivElement.

maxSize	
Maximum size of Panel within its parent group; defaults to 100%.

minSize	
Minimum size of Panel within its parent group; defaults to 0%.

onResize	
Called when panel sizes change; receives a map of Panel id to size.

panelRef	
Exposes the following imperative API:

collapse(): void
expand(): void
getSize(): number
isCollapsed(): boolean
isExpanded(): boolean
resize(size: number): void
ℹ️ The usePanelRef and usePanelCallbackRef hooks are exported for convenience use in TypeScript projects.

Separator
Separators are not required but they are recommended as they improve keyboard accessibility.

Separators should be rendered as the direct child of a Group component.

Separator elements always include the following attributes:

<div data-separator data-testid="separator-id-prop" id="separator-id-prop" role="separator">
ℹ️ Test id can be used to narrow selection when unit testing.

ℹ️ In addition to the attributes shown above, separator also renders all required WAI-ARIA properties.

Required props
None

Optional props
Name	Description
className	
CSS class name.

ℹ️ Use the data-separator attribute for custom hover and active styles

⚠️ The following properties cannot be overridden: flex-grow, flex-shrink

id	
Uniquely identifies the separator within the parent group. Falls back to useId when not provided.

ℹ️ This value will also be assigned to the data-separator attribute.

style	
CSS properties.

ℹ️ Use the data-separator attribute for custom hover and active styles

⚠️ The following properties cannot be overridden: flex-grow, flex-shrink

elementRef	
Ref attached to the root HTMLDivElement.

Readme
Keywords
none