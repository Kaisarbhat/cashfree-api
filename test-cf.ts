import { Cashfree } from 'cashfree-verification';

const methods = Object.getOwnPropertyNames(Cashfree).filter(p => typeof Cashfree[p] === 'function');
console.log("SDK Methods:", methods);
