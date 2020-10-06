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

## Adding Concurrency

The problem with our current `render` is that it renders the complete element tree on the main thread. If the tree is really big, this could block the main thread for too long.

To solve this, we will break the work into **small units**. After each small unit of work, we'll give the browser a chance to interrupt the rendering process to perform whatever else it needs to do.

The core API we'll be using is `requestIdleCallback`, which accepts a callback that runs when the main thread is idle. (_Note that React doesn't use `requestIdleCallback` anymore but instead uses their own scheduler package. However, in principle, the idea is the same._)

```js
let nextUnitOfWork = null;

const performUnitOfWork = nextUnitOfWork => {
  // (1) Do something here
  // (2) Then return next unit of work
};

// The callback is given a `deadline` argument where
// we are told when the browser will take control again.
// So while `deadline` has time remaining, we will loop
// through existing units of work.
const workLoopCallback = deadline => {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }
  requestIdleCallback(workLoopCallback);
};

requestIdleCallback(workLoopCallback);
```

### Fibers

We need a data structure to organize our units of work in `performUnitOfWork`. The data structure we'll use is called a **fiber tree**, and it corresponds to our virtual DOM tree.

Each **fiber** is an element representing 1 unit of work. In pseudocode, here's how we will handle each fiber in the fiber tree:

1. Add the element to the DOM.
2. Determine what fiber to create next:
   1. Try to create a fiber for the element's first child.
   2. If the element has no children, create a fiber for its nearest sibling.
   3. If the element has no sibling, we move onto the parent's sibling or the parent's parent's sibling (up and up the tree until we find a sibling).
3. If we reach the root, stop. Otherwise, set the next unit of work based on the newly created fiber.

To perform this pseudocode, every fiber must have a link to its

- First child
- Next sibling
- Parent

For example, take this DOM tree:

```html
<div>
  <h1>
    <span>Hello World: </span>
    <a href="">Click Me</a>
  </h1>
  <p>I'm some text</p>
</div>
```

In the example above, we will

1. Create the `div` element and create a fiber for the next child `h1` as the next unit of work.
2. When the `h1` unit of work runs, create the `h1` element. With a first child of `span`, we set this as the next unit of work.
3. When the `span` unit of work runs, we create the element and then move onto `a`, the nearest sibling.
4. When the `a` unit of work runs, we create the element and move onto `p`, the parent's sibling, since `a` has no children or next siblings of its own.
5. Finally, when the `p` unit of work runs, we create the element, and we're done. There are no more children, siblings, or parent's siblings.

### Code implementation of concurrency and the fiber tree

The first thing we need to do is move the DOM creation inside `render` into its own function:

```js
DiyReact.createDom = fiber => {
  const dom =
    fiber.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(fiber.type);

  Object.keys(fiber.props)
    .filter(key => key !== 'children')
    .forEach(key => (dom[key] = fiber.props[key]));

  return dom;
};
```

The `render` function will now only do 1 thing: set the first unit of work to the root of the fiber tree.

```js
DiyReact.render = (element, container) => {
  nextUnitOfWork = {
    dom: container,
    props: {
      children: [element],
    },
  };
};
```

When the main thread is idle, it will call our `workLoopCallback`, where we run `performUnitOfWork`. This is where we'll (1) add DOM nodes and (2) create new fibers to set as the next units of work.

```js
const performUnitOfWork = fiber => {
  // 1. Add DOM node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  // 2. Append DOM node to parent node
  if (fiber.parent) {
    fiber.parent.dom.appendChild(fiber.dom);
  }

  // 2. Create fibers for children and link them
  const elements = fiber.props.children;
  let prevSibling = null;
  elements.forEach((element, index) => {
    const newFiber = {
      type: element.type,
      props: element.props,
      parent: fiber,
      dom: null,
    };

    // If it's the first child, link the fiber to the parent
    // Otherwise, link it to the sibling
    if (index === 0) {
      fiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
  });

  // 3. Search for and return next unit of work
  // Try to return first child first
  if (fiber.child) {
    return fiber.child;
  }
  // Try to return sibling next
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // If sibling not found, move to parent's sibling
    nextFiber = nextFiber.parent;
  }
};
```

## The Commit Phase

The next problem with our code is that new nodes are constantly being added to the DOM, but the main thread could interrupt our work mid-render. As a result, the user could see an **incomplete UI** while the main thread is occupied.

To solve this problem, instead of mutating the DOM _as we construct_ the fiber tree, we are only going to mutate the DOM _after_ all units of work are complete. We call this the **commit phase**.

To start, let's delete these lines of code because we don't need to mutate the DOM on the spot anymore:

```js
function performUnitOfWork(fiber) {
  // ...
​
  // if (fiber.parent) {
  //   fiber.parent.dom.appendChild(fiber.dom)
  // }

  // ...
}
```

Instead, we will construct the entire fiber tree and store the root of that tree in a `fiberRoot` variable:

```js
let nextUnitOfWork = null;
let fiberRoot = null;

// The render function now stores the fiberRoot
// and sets it as the next unit of work to get the ball rolling
DiyReact.render = (element, container) => {
  fiberRoot = {
    dom: container,
    props: {
      children: [element],
    },
  };
  nextUnitOfWork = fiberRoot;
};
```

Then, when we've constructed the entire fiber tree, we will run the `commitRoot` and `commitWork` functions that perform the DOM manipulation:

```js
const workLoopCallback = deadline => {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  // commitRoot only runs AFTER we've constructed the fiber tree
  if (!nextUnitOfWork && fiberRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoopCallback);
};

// This is where DOM manipulation happens
// Recursively, we append a fiber to its parent
// Then we move on to committing/rendering its first child and nearest sibling.
const commitWork = fiber => {
  if (!fiber) return;

  const domParent = fiber.parent.dom;
  domParent.appendChild(fiber.dom);
  commitWork(fiber.child);
  commitWork(fiber.sibling);
};

// This function gets the ball rolling by
// committing/rendering the first child of the fiber root
const commitRoot = () => {
  commitWork(fiberRoot.child);
  fiberRoot = null;
};
```

## Reconciliation

The next concern we have is handling **updates** and **deletions** of nodes in the DOM. To do this, we need to compare elements in our current fiber tree to the **last fiber tree we committed in the DOM**.

So, the first thing we have to do is store a reference to the last fiber tree we committed:

```js
let currentRoot = null;

const commitRoot = () => {
  commitWork(wipRoot.child);

  // When we commit the fiber tree, we store it!
  currentRoot = wipRoot;

  wipRoot = null;
};
```
