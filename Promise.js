/**
 * @file JS Promise实现
 * @author bruxexyj@gmail.com
 */
(function (factory, global) {
    if (typeof define === 'function' && define.amd) {
        define(factory);
    }
    else if (typeof module === 'object' && module.exports) {
        module.exports = exports = factory();
    }
    else {
        global.Promise = factory();
    }
}(function () {

    /**
     * Promise对象的内部状态
     *
     * @type {Object}
     */
    var Status = {
        PENDING: 'pending',
        FULLFILLED: 'resolved',
        REJECTED: 'rejected'
    };

    function empty() {}

    /**
     * Promise构造函数
     *
     * @constructor
     * @param {Function} resolver 此Promise对象管理的任务
     */
    function Promise(resolver) {
        // ES6原生的Promise构造函数中，若不通过`new`调用Promise的构造函数，会抛出TypeError异常。此处与其一致
        if (!(this instanceof Promise)) {
            throw new TypeError('TypeError: undefined is not a promise');
        }

        // ES6原生的Promise构造函数中，若无作为函数的resolver参数，会抛出TypeError异常。此处与其一致
        if (typeof resolver !== 'function') {
            throw new TypeError('TypeError: Promise resolver undefined is not a function');
        }

        /**
         * Promise对象内部的状态，初始为`pending`。状态只能由`pending`到`fullfilled`或`rejected`
         *
         * @type {string}
         */
        this._status = Status.PENDING;

        /**
         * Promise对象resolved/rejected后拥有的data/reason
         *
         *  - 此处保存此值是为了当一个Promise对象被resolved或rejected后，继续对其调用`then`添加任务，后续处理仍能获得当前Promise的值
         *
         * @type {Mixed}
         */
        this._value;

        /**
         * 当前Promise被resolved/rejected后，需处理的任务
         *
         *  - 由于同一个Promise对象可以调用多次`then`方法，以添加多个并行任务，所以此处是一个数组
         *
         * @type {Array.<Function>}
         */
        this._doneCallbacks = [];
        this._failCallbacks = [];

        var promise = this;
        resolver(
            function (data) {
                resolve(promise, data);
            },
            function (reason) {
                reject(promise, reason);
            }
        );
    }

    Promise.prototype = {

        constructor: Promise,

        /**
         * Promise的`then`方法
         *
         * @param {Function|Mixed} onResolve 当前Promise对象被resolved后，需处理的任务
         * @param {Function|Mixed} onReject 当前Promise对象被rejected后，需处理的任务
         * @return {Promise} 返回一个新的Promise对象，用于链式操作
         */
        then: function (onResolve, onReject) {
            var promise = new Promise(empty);

            this._doneCallbacks.push(makeCallback(promise, onResolve, 'resolve'));
            this._failCallbacks.push(makeCallback(promise, onReject, 'reject'));

            // 如果在一个已经被fullfilled或rejected的promise上调用then，则需要直接执行通过then注册的回调函数
            run(this);

            return promise;
        },

        /**
         * Promise的`done`方法
         *
         * @param {Function|Mixed} onResolve 当前Promise对象被resolved后，需处理的任务
         * @return {Promise} 返回一个新的Promise对象，用于链式操作
         */
        done: function (onResolve) {
            return this.then(onResolve, null);
        },

        /**
         * Promise的`fail`方法
         *
         * @param {Function|Mixed} onReject 当前Promise对象被rejected后，需处理的任务
         * @return {Promise} 返回一个新的Promise对象，用于链式操作
         */
        fail: function (onReject) {
            return this.then(null, onReject);
        },

        /**
         * Promise的`catch`方法
         *
         * @param {Function|Mixed} onFail 当前Promise对象被rejected后，需处理的任务
         * @return {Promise} 返回一个新的Promise对象，用于链式操作
         */
        catch: function (onFail) {
            return this.then(null, onFail);
        }
    };

    /**
     * 创建一个Promise对象，并用给定值resolve它
     *
     * @param {Mixed} value 用于resolve新创建的Promise对象的值
     * @return {Promise} 返回一个新的Promise对象，用于链式操作
     */
    Promise.resolve = function (value) {
        var promise = new Promise(empty);
        resolve(promise, value);
        return promise;
    };

    /**
     * 创建一个Promise对象，并用给定值reject它
     *
     * @param {Mixed} reason 用于reject新创建的Promise对象的值
     * @return {Promise} 返回一个新的Promise对象，用于链式操作
     */
    Promise.reject = function (reason) {
        var promise = new Promise(empty);
        reject(promise, reason);
        return promise;
    };

    /**
     * 返回一个promise，这个promise在iterable中的任意一个promise被解决或拒绝后，
     * 立刻以相同的解决值被解决或以相同的拒绝原因被拒绝
     *
     * @param {Iterable.<Promise|Mixed>} iterable 一组Promise对象或其它值
     * @return {Promise} 返回一个新的Promise对象，用于链式操作
     */
    Promise.race = function (iterable) {
        if (!iterable || !iterable.hasOwnProperty('length')) {
            throw new TypeError('TypeError: Parameter `iterable` must be a iterable object');
        }

        var promise = new Promise(empty);
        for (var i = 0, len = iterable.length; i < len; i++) {
            var iterate = iterable[i];
            if (!(iterate instanceof Promise)) {
                iterate = Promise.resolve(iterate);
            }

            iterate.then(resolveRaceCallback, rejectRaceCallback);
        }

        var settled = false;

        function resolveRaceCallback(data) {
            if (settled) {
                return;
            }

            settled = true;
            resolve(promise, data);
        }

        function rejectRaceCallback(reason) {
            if (settled) {
                return;
            }

            settled = true;
            reject(promise, reason);
        }
    };

    /**
     * 返回一个promise，该promise会在iterable参数内的所有promise都被解决后被解决
     *
     * @param {Iterable.<Promise|Mixed>} iterable 一组Promise对象或其它值
     * @return {Promise} 返回一个新的Promise对象，用于链式操作
     */
    Promise.all = function (iterable) {
        if (!iterable || !iterable.hasOwnProperty('length')) {
            throw new TypeError('TypeError: Parameter `iterable` must be a iterable object');
        }

        var promise = new Promise(empty);
        var length = iterable.length;
        for (var i = 0; i < length; i++) {
            var iterate = iterable[i];
            if (!(iterate instanceof Promise)) {
                iterate = Promise.resolve(iterate);
            }

            iterate.then(makeAllCallback(iterate, i, 'resolve'), makeAllCallback(iterate, i, 'reject'));
        }

        var result = [];
        var count = 0;

        function makeAllCallback(iterate, index, action) {
            return function (value) {
                if (action === 'reject') {
                    reject(promise, value);
                    return;
                }

                result[index] = value;

                if (++count === length) {
                    resolve(promise, result);
                }
            }
        }
    };

    /**
     * 返回一个Deferred对象，包含一个新创建的Promise对象，以及`resolve`和`reject`方法
     *
     * @return {Deferred}
     */
    Promise.defer = function () {
        var promise = new Promise(empty);

        return {
            promise: promise,
            resolve: function (data) {
                resolve(promise, data);
            },
            reject: function (reason) {
                reject(promise, reason);
            }
        };
    };

    function run(promise) {
        // `then`方法中也会调用，所以此处仍需做一次判断
        if (promise._status === Status.PENDING) {
            return;
        }

        var value = promise._value;
        var callbacks = promise._status === Status.FULLFILLED
            ? promise._doneCallbacks
            : promise._failCallbacks;

        // Promise需要异步操作
        setTimeout(function () {
            for (var i = 0, len = callbacks.length; i < len; i++) {
                callbacks[i](value);
            }
        });

        // 每个promise只能被执行一次。虽然`_doneCallbacks`和`_failCallbacks`用户不应该直接访问，
        // 但还是可以访问到，保险起见，做清空处理。
        promise._doneCallbacks = [];
        promise._failCallbacks = [];
    }

    function resolve(promise, data) {
        if (promise._status !== Status.PENDING) {
            return;
        }

        promise._status = Status.FULLFILLED;
        promise._value = data;

        run(promise);
    }

    function reject(promise, reason) {
        if (promise._status !== Status.PENDING) {
            return;
        }

        promise._status = Status.REJECTED;
        promise._value = reason;

        run(promise);
    }

    function makeCallback(promise, callback, action) {
        return function promiseCallback(value) {
            // 如果传递了callback，则使用前一个promise传递过来的值作为参数调用callback，
            // 并根据callback的调用结果来处理当前promise
            if (typeof callback === 'function') {
                var x;
                try {
                    x = callback(value);
                }
                catch (e) {
                    // 如果调用callback时抛出异常，则直接用此异常对象reject当前promise
                    reject(promise, e);
                }

                // 如果callback的返回值是当前promise，为避免造成死循环，需要抛出异常
                // 根据Promise+规范，此处应抛出TypeError异常
                if (x === promise) {
                    var reason = new TypeError('TypeError: The return value could not be same with the promise');
                    reject(promise, reason);
                }
                // 如果返回值是一个Promise对象，则当返回的Promise对象被resolve/reject后，再resolve/reject当前Promise
                else if (x instanceof Promise) {
                    x.then(
                        function (data) {
                            resolve(promise, data);
                        },
                        function (reason) {
                            reject(promise, reason);
                        }
                    );
                }
                else {
                    var then;
                    (function resolveThenable(x) {
                        // 如果返回的是一个Thenable对象（此处逻辑有点坑，参照Promise+的规范实现）
                        if (x && (typeof x === 'object'|| typeof x === 'function')) {
                            try {
                                then = x.then;
                            }
                            catch (e) {
                                reject(promise, e);
                                return;
                            }

                            if (typeof then === 'function') {
                                // 调用Thenable对象的`then`方法时，传递进去的`resolvePromise`和`rejectPromise`方法（及下面的两个匿名方法）
                                // 可能会被重复调用。但Promise+规范规定这两个方法有且只能有其中的一个被调用一次，多次调用将被忽略。
                                // 此处通过`invoked`来处理重复调用
                                var invoked = false;
                                try {
                                    then.call(
                                        x,
                                        function (y) {
                                            if (invoked) {
                                                return;
                                            }
                                            invoked = true;

                                            // 避免死循环
                                            if (y === x) {
                                                throw new TypeError('TypeError: The return value could not be same with the previous thenable object');
                                            }

                                            // y仍有可能是thenable对象，递归调用
                                            resolveThenable(y);
                                        },
                                        function (e) {
                                            if (invoked) {
                                                return;
                                            }
                                            invoked = true;

                                            reject(promise, e);
                                        }
                                    );
                                }
                                catch (e) {
                                    // 如果`resolvePromise`和`rejectPromise`方法被调用后，再抛出异常，则忽略异常
                                    // 否则用异常对象reject此Promise对象
                                    if (!invoked) {
                                        reject(promise, e);
                                    }
                                }
                            }
                            else {
                                resolve(promise, x);
                            }
                        }
                        else {
                            resolve(promise, x);
                        }
                    }(x));
                }
            }
            // 如果未传递callback，直接用前一个promise传递过来的值resolve/reject当前Promise对象
            else {
                action === 'resolve'
                    ? resolve(promise, value)
                    : reject(promise, value);
            }
        };
    }

    return Promise;
}, this));
