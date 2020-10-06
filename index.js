const DiyReact = {};

DiyReact.createTextElement = text => ({
  type: 'TEXT_ELEMENT',
  props: {
    nodeValue: text,
    children: [],
  },
});

DiyReact.createElement = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    children: children.map(child =>
      typeof child === 'object' ? child : DiyReact.createTextElement(child)
    ),
  },
});

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

const render = (element, container) => {
  nextUnitOfWork = {
    dom: container,
    props: {
      children: [element],
    },
  };
};

let nextUnitOfWork = null;

const performUnitOfWork = nextUnitOfWork => {
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
