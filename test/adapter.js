// ES6原生Promise
// exports.resolved = Promise.resolve.bind(Promise);
// exports.rejected = Promise.reject.bind(Promise);
// exports.deferred = Promise.defer.bind(Promise);

// 自己实现的Promise
var Promise = require('../Promise');
exports.resolved = Promise.resolve;
exports.rejected = Promise.reject;
exports.deferred = Promise.defer;
