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

DiyReact.render = (element, container) => {
  const node =
    element.type === 'TEXT_ELEMENT'
      ? document.createTextNode('')
      : document.createElement(element.type);

  Object.keys(element.props)
    .filter(key => key !== 'children')
    .forEach(key => (node[key] = element.props[key]));

  element.props.children.forEach(child => DiyReact.render(child, node));

  container.appendChild(node);
};
