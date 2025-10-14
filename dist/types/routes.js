"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaginationMeta = createPaginationMeta;
function createPaginationMeta(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return {
        total,
        currentPage: page,
        limit,
        totalPages,
        page,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
}
//# sourceMappingURL=routes.js.map