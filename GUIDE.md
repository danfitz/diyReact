# Walkthrough/Guide of the React Codebase

This guide will walk through the important components that make up React.

## React Converted to Vanilla JS

The most basic React application goes something like this:

1. Create a React element with JSX, which basically transpiles to `React.createElement`.
2. Get a container from the DOM.
3. Insert the React element into the container.

```js
const element = <h1 color="green">Hello World</h1>;
const container = document.getElementById("root");
ReactDOM.render(element, container);
```

### Converting `React.createElement`

With transpilation, the JSX above is really just:

```js
const element = React.createElement("h1", { color: "green" }, "Hello World");
```

And `React.createElement` is just a fancy way of constructing an object that represents an element:

```js
const element = {
  type: "h1",
  props: {
    color: "green",
    children: "Hello World",
  },
};
```

The 2 main object properties we care about in React are `type` and `props`. `type` is the tag name you pass to `document.createElement` to create a new DOM element. And `props` has a special sub-property called `children`, which can be either a string or an array of even more React elements.

### Converting `ReactDOM.render`

`ReactDOM.render` is really just where we take the objects that represent elements and make actual changes to the DOM. (That's why we're using `ReactDOM` and not just `React`.)

So, `ReactDOM.render(element, container);` is just a fancy way of performing the following steps:

1. Create the DOM node based on the React element's `type`.
2. Add the `props` to the element's properties.
3. Create DOM nodes for the `children`.
4. Append the `children` to the main DOM node.
5. Append the main DOM node to the container.

```js
const document.getElementById('root');

// 1
const node = document.createElement(element.type);
// 2
node["color"] = element.props.color;

// 3
// Since `children` is just a string, we just create a text node
const textNode = document.createTextNode("");
textNode.nodeValue = element.props.children;

// 4
node.appendChild(textNode);
// 5
container.appendChild(node);
```

## Recreating `React.createElement`

`React.createElement` just creates an object with key properties like `type` and `props` and `children`.

Here's how it would roughly look:

```js
const createElement = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    children,
  },
});
```

The key thing here is that we use the rest syntax to turn all child elements passed into the function into an array, ensuring that `children` is always an array.
