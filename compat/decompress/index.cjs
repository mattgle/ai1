module.exports = (...args) => import("@xhmikosr/decompress").then(({ default: extract }) => extract(...args));
