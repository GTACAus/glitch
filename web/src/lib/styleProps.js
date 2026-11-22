// The CSS properties the style panel offers, by group. Each is [property], [property, 'color'] for
// a colour picker, or [property, [choices]] for a dropdown.
export const STYLE_GROUPS = {
  Text: [
    ['color', 'color'],
    ['font-size'],
    ['font-weight', ['100', '200', '300', '400', '500', '600', '700', '800', '900']],
    ['font-style', ['normal', 'italic']],
    ['font-family'],
    ['line-height'],
    ['letter-spacing'],
    ['text-align', ['left', 'center', 'right', 'justify']],
    ['text-decoration-line', ['none', 'underline', 'line-through']],
    ['text-transform', ['none', 'uppercase', 'lowercase', 'capitalize']],
  ],
  Background: [
    ['background-color', 'color'],
    ['background-image'],
    ['background-size'],
    ['opacity'],
  ],
  Box: [['width'], ['height'], ['margin'], ['padding'], ['box-shadow']],
  Border: [
    ['border-width'],
    ['border-style', ['none', 'solid', 'dashed', 'dotted', 'double']],
    ['border-color', 'color'],
    ['border-radius'],
  ],
  Layout: [
    ['display', ['block', 'inline', 'inline-block', 'flex', 'grid', 'none']],
    ['position', ['static', 'relative', 'absolute', 'fixed', 'sticky']],
    ['flex-direction', ['row', 'column', 'row-reverse', 'column-reverse']],
    [
      'justify-content',
      ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
    ],
    ['align-items', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline']],
    ['gap'],
    ['overflow', ['visible', 'hidden', 'scroll', 'auto']],
    ['cursor'],
  ],
};

export const STYLE_PROPS = Object.values(STYLE_GROUPS)
  .flat()
  .map(([p]) => p);
