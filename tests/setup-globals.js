// jsdom 测试环境没有 TextEncoder / TextDecoder（ZIP、PDF 内核要用），从 Node 补上
const { TextEncoder, TextDecoder } = require('util');

if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder;
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder;
