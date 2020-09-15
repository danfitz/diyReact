# Walkthrough/Guide of the React Codebase

This guide will walk through the important components that make up React.

## React Converted to Vanilla JS

The most basic React application goes something like this:

1. Create a React element with JSX, which basically transpiles to `React.createElement`.
2. Get a container from the DOM.
3. Insert the React element into the container.

```js
const element = <h1 color='green'>Hello World</h1>;
const container = document.getElementById('root');
ReactDOM.render(element, container);
```

### Converting `React.createElement`

With transpilation, the JSX above is really just:

```js
const element = React.createElement('h1', { color: 'green' }, 'Hello World');
```

And `React.createElement` is just a fancy way of constructing an object that represents an element:

```js
const element = {
  type: 'h1',
  props: {
    color: 'green',
    children: 'Hello World',
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

## Recreating `createElement`

`React.createElement` just creates an object with key properties like `type` and `props` and `children`.

Here's how it would roughly look:

```js
const DiyReact = {
  createElement: (type, props, ...children) => ({
    type,
    props: {
      ...props,
      children,
    },
  });
}
```

The key thing here is that we use the rest syntax to turn all child elements passed into the function into an array, ensuring that `children` is always an array.

With the function above alone, running

```js
DiyReact.createElement('div');
```

will generate this:

```js
// - There are no other props b/c `props` parameter is undefined, and spreading undefined does nothing
// - Children is an empty array b/c the rest syntax groups together nothing
const element = {
  type: 'div',
  props: {
    children: [],
  },
};
```

**Note**: Technically, React doesn't create empty arrays when there are no `children`. However, for the sake of demonstration, this makes for simpler code, while React cares more about performant code.

Similarly, running

```js
// We pass null to skip the props argument
DiyReact.createElement('div', null, childElement);
```

will generate this:

```js
const element = {
  type: 'div',
  props: {
    children: [childElement],
  },
};
```

### Handling child primitives like strings and numbers

Sometimes elements have `children` that are strings or numbers. High-level, to handle anything that isn't an element object, we will wrap these primitives in their own element object with a special type: `TEXT_ELEMENT`.

```js
DiyReact.createTextElement = text => ({
  type: 'TEXT_ELEMENT',
  props: {
    nodeValue: text,
    children: [],
  },
});

DiyReact.createElement = (type, props, ...children) => {
  type,
  props: {
    ...props,
    children: children.map(child => typeof child === 'object' ? child : DiyReact.createTextElement(child))
  }
}
```

**Note**: React doesn't technically wrap child strings and numbers. Again, this is to simplify our code, but React has a more performant way of solving for this problem.

### Using `createElement` with babel

All it takes to tell Babel to use `DiyReact.createElement` instead of `React.createElement` is to add a comment above any JSX:

```js
/** @jsx DiyReact.createElement */
const element = <div color='green'>Hello World!</div>;
```

Now when babel transpiles the JSX, it will use our function instead of React's.

## Recreating `render`

Just like with the vanilla JS above, we'll do something similar with our own `render` function:

```js
DiyReact.render = (element, container) => {
  // 1. Create node (text node if it's a TEXT_ELEMENT)
  const node =
    element.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(element.type);

  // 2. Assign props to node
  Object.keys(element.props)
    .filter(key => key !== 'children')
    .forEach(key => (node[key] = element.props[key]));

  // 3. Recursively render children
  element.props.children.forEach(child => DiyReact.render(child, node));

  // 4. Append node to container
  container.appendChild(node);
};
```

You now have a working version of DiyReact that can add elements to the DOM. (We can remove elements yet.)
