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

  // 3. Create fibers for children and link them
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

  // 4. Search for and return next unit of work
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

## The Render and Commit Phases

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

Instead, we will construct the entire fiber tree and store the root of that tree in a `wipRoot` variable:

```js
let nextUnitOfWork = null;
let wipRoot = null;

// The render function now stores the wipRoot
// and sets it as the next unit of work to get the ball rolling
DiyReact.render = (element, container) => {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
  };
  nextUnitOfWork = wipRoot;
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
  if (!nextUnitOfWork && wipRoot) {
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
  commitWork(wipRoot.child);
  wipRoot = null;
};
```

## Reconciliation

The next concern we have is handling **updates** and **deletions** of nodes in the DOM. To do this, we need to compare elements in our current fiber tree to the **last fiber tree we committed in the DOM**.

So, the first thing we have to do is store a reference to the last fiber tree we committed--both in a global variable _and_ in the `wipRoot` itself:

```js
let currentRoot = null;

const commitRoot = () => {
  commitWork(wipRoot.child);

  // Before we commit our current fiber tree,
  // we store it as the last committed fiber tree
  // (because it's about to be committed)
  currentRoot = wipRoot;

  wipRoot = null;
};

DiyReact.render = (element, container) => {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    // And during render, we store our last committed
    // fiber tree's root as the ALTERNATE of our WIP root
    alternate: currentRoot;
  }
};
```

Now that we have access to our last committed fiber tree, we want to refactor the code where we _create_ our fibers. Fiber creation can be found in `performUnitOfWork`; this is where we loop over the children of our active fiber and create fibers for those children.

Now that we're going to perform a comparison _between_ children, we want to move the logic to a `reconcileChildren` function:

```js
const performUnitOfWork = fiber => {
  // ...

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);

  // ...
};

const reconcileChildren = (wipFiber, elements) => {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  // We're essentially looping through the incoming children
  // and the old children at the same time!
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    // TODO: Compare oldFiber to element
    // element = what we want to render
    // oldFiber = what we rendered last time

    if (oldFiber) oldFiber = oldFiber.sibling;

    if (index === 0) {
      wipFiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
  }
};
```

Using the `type` property of each element, there are 3 comparisons we care about with 3 different responses:

1. If the old fiber and the new element have the **same type**, we **keep the DOM node** and **update the props**.
2. If the **type is different** and the **new element exists**, we **create a new DOM node**.
3. If the **type is different** and the **old fiber exists**, we **remove the old DOM node**.

**Note**: React uses `key` properties for more efficient reconciliation. For example, a `key` helps React know when children change positions in an array.

Here's the implementation:

```js
const reconcileChildren = (wipFiber, elements) => {
  // ...

  const sameType = oldFiber && element && oldFiber.type === element.type;

  // We mix and match properties here
  if (sameType) {
    newFiber = {
      type: oldFiber.type,
      props: element.props,
      dom: oldFiber.dom,
      parent: wipFiber,
      alternate: oldFiber, // Link the alternate here too
      effectTag: 'UPDATE', // Used during commit
    };
  }

  // We create a new fiber
  if (element && !sameType) {
    newFiber = {
      type: element.type,
      props: element.props,
      dom: null,
      parent: wipFiber,
      alternate: null,
      effectTag: 'PLACEMENT',
    };
  }

  // We keep the old fiber and send it for deletion
  if (oldFiber && !sameType) {
    oldFiber.effectTag = 'DELETION';
    deletions.push(oldFiber);
  }

  // ...
};
```

Notice how we send the old fiber for deletion by pushing it into a `deletions` array. We need to add a bit more code to get `deletions` to become part of the commit phase:

```js
let deletions = null;

DiyReact.render = (element, container) => {
  // ...

  // Reset to empty array when we start on a new
  // render and commit phase
  deletions = [];

  // ...
};

const commitRoot = () => {
  // During the commit phase, we actually
  // start the DOM manipulation using the old fibers
  deletions.forEach(commitWork);

  // ...
};
```

Now that our old fibers are up for `DELETION` and our new fibers are up for `UPDATE` or `PLACEMENT`, we need to refactor `commitWork` to handle these `effectTags`:

```js
const commitWork = fiber => {
  if (!fiber) return;

  const domParent = fiber.parent.dom;

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === 'DELETION') {
    domParent.removeChild(fiber.dom);
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom !== null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
};
```

`PLACEMENT` and `DELETION` are easy. We just add or remove the DOM node from the parent. The trickier part is handling `UPDATE` because it requires comparing old and new props. In particular, we need to

- Remove props that are gone, and
- Set props that are new or have changed.

We create an `updateDom` helper function to encapsulate this update logic:

```js
// Prop checks
const isProp = key => key !== 'children' && !isEvent(key);
const isNew = (prev, next) => key => prev[key] !== next[key];
const isGone = (prev, next) => key => !(key in next);

const updateDom = (dom, prevProps, nextProps) => {
  // Remove old properties
  Object.keys(prevProps)
    .filter(isProp)
    .filter(isGone(prevProps, nextProps))
    .forEach(name => (dom[name] = ''));

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProp)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => (dom[name] = nextProps[name]));
};
```

However, we need to factor for _event listeners_ because adding or removing them specially requires using `addEventListener` and `removeEvenListener`, so let's refactor:

```js
// Prop checks
const isEvent = key => key.startsWith('on');
// isProp, isNew, isGone...

const updateDom = (dom, prevProps, nextProps) => {
  // Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // Remove old properties...
  // Set new or changed properties...
};
```

## Function Components

Let's add support for **function components** now. Function components have 2 core differences:

1. When creating a fiber, you don't have a DOM node. (After all, why would a function need a DOM node?)
2. `children` come from invoking the function instead of accessing them through `props`.

To start, we need to refactor the fiber creation part of the render phase. In particular, we need to move the existing logic into an `updateHostComponent` function and create an `updateFunctionComponent` function to handle the special case of function components.

```js
const performUnitOfWork = fiber => {
  // fiber.type can be a function because JSX like <Component />
  // will pass the function itself to the type property
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // ...
};

const updateFunctionComponent = fiber => {
  // TODO
};

// This code used to be in performUnitOfWork
const updateHostComponent = fiber => {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
};
```

So this is what will happen in our `updateFunctionComponent`:

```js
const updateFunctionComponent = fiber => {
  // 1. Get children by invoking function
  const children = [fiber.type(fiber.props)];
  // Perform reconciliation just like normal
  reconcileChildren(fiber, children);
};
```

The last thing we need to do to support function components is to refactor `commitWork` given that function components themselves don't have DOM nodes.

In particular, we need to do 2 things:

1. When appending a DOM node, we need to traverse up the fiber tree until we find a parent fiber with a DOM node (i.e. a parent fiber that isn't a function component).
   - This happens under the `PLACEMENT` effect tag.
2. Similarly, when removing a DOM node, we need to traverse down and down the fiber tree until we find a child fiber with a DOM node (i.e. a child fiber that isn't a function component).
   - This happens under the `DELETION` effect tag.

```js
const commitWork = fiber => {
  // ...

  // Go up the fiber tree until you find a parent with a DOM node
  // (a parent that isn't a function component)
  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) {
    domParent.appendChild(fiber.dom);
  } else if (/* */) {

    // ...

  } else if (fiber.effectTag === 'DELETION') {
    commitDeletion(fiber, domParent);
  }

  // ...
};

// Go down and down the fiber tree until you find a child with a DOM node
// (a child that isn't a function component)
const commitDeletion = (fiber, domParent) => {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}
```

## Hooks

Now that we have function components, it makes sense to add **state**, specifically the `useState` hook.

To begin, we need access to some global variables that we initialize in the `updateFunctionComponent` function:

```js
let wipFiber = null;
let hookIndex = null;

const updateFunctionComponent = fiber => {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];

  // ...
};
```

**Note**: We keep track of an array of `hooks` because it allows us to support multiple uses of `useState`.

The next thing we need to do is **persist** state: every time a function component goes through the render and commit phases, we want any state it had to carry over.

That means:

1. We check if any old hook exists in `wipFiber.alternate.hooks` using the current `hookIndex`.
2. If it does exist, we copy the state from the old hook into the new hook.
3. Otherwise, we initialize the state.
4. Finally, we append the hook to the fiber and increment the `hookIndex`.

```js
DiyReact.useState = initial => {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  const hook = { state: oldHook ? oldHook.state : initial };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state];
};
```
