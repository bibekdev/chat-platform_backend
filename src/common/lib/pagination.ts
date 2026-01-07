import { and, asc, desc, gt, lt, or, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import z from 'zod';

// ==================== SCHEMAS ====================

export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

// ==================== TYPES ====================

export interface CursorData {
  id: string;
  /** Timestamp used for cursor pagination (can be createdAt, lastMessagedAt, etc.) */
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    prevCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface PaginationConfig {
  limit: number;
  cursor?: string;
  direction: 'asc' | 'desc';
}

// ==================== CURSOR ENCODING/DECODING ====================

/**
 * Encodes cursor data into a compact URL-safe string
 * Format: {timestamp_base36}.{id}
 * Example: "lk8o4cg0.friend_01HXYZ"
 */
export function encodeCursor(data: CursorData): string {
  const ts = new Date(data.timestamp).getTime();
  return `${ts.toString(36)}.${data.id}`;
}

/**
 * Decodes a compact cursor string into cursor data
 * Returns null if the cursor is invalid
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const dotIndex = cursor.indexOf('.');
    if (dotIndex === -1) {
      return null;
    }

    const timestampBase36 = cursor.slice(0, dotIndex);
    const id = cursor.slice(dotIndex + 1);

    if (!timestampBase36 || !id) {
      return null;
    }

    const timestamp = parseInt(timestampBase36, 36);
    if (isNaN(timestamp)) {
      return null;
    }

    return {
      id,
      timestamp: new Date(timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}

// ==================== QUERY BUILDERS ====================

/**
 * Builds cursor-based pagination conditions for Drizzle ORM queries
 * Uses row value comparison for proper cursor pagination:
 * (timestamp, id) < (cursorTimestamp, cursorId) for desc
 * (timestamp, id) > (cursorTimestamp, cursorId) for asc
 *
 * @param config - Pagination configuration
 * @param timestampColumn - The timestamp column from the table (createdAt, lastMessagedAt, etc.)
 * @param idColumn - The id column from the table
 * @returns SQL condition for the WHERE clause, or undefined if no cursor
 */
export function buildCursorCondition(
  config: PaginationConfig,
  timestampColumn: PgColumn,
  idColumn: PgColumn
): SQL | undefined {
  if (!config.cursor) {
    return undefined;
  }

  const cursorData = decodeCursor(config.cursor);
  if (!cursorData) {
    return undefined;
  }

  const cursorDate = new Date(cursorData.timestamp);

  // Row value comparison: (timestamp, id) < (cursorTimestamp, cursorId)
  // Equivalent to: timestamp < cursorDate OR (timestamp = cursorDate AND id < cursorId)
  if (config.direction === 'desc') {
    return or(
      lt(timestampColumn, cursorDate),
      and(
        lt(timestampColumn, new Date(cursorDate.getTime() + 1)), // timestamp <= cursorDate
        gt(timestampColumn, new Date(cursorDate.getTime() - 1)), // timestamp >= cursorDate (effectively =)
        lt(idColumn, cursorData.id)
      )
    );
  } else {
    return or(
      gt(timestampColumn, cursorDate),
      and(
        lt(timestampColumn, new Date(cursorDate.getTime() + 1)),
        gt(timestampColumn, new Date(cursorDate.getTime() - 1)),
        gt(idColumn, cursorData.id)
      )
    );
  }
}

/**
 * Returns the sort direction function (asc/desc) for Drizzle ORDER BY
 */
export function getSortDirection(direction: 'asc' | 'desc') {
  return direction === 'asc' ? asc : desc;
}

// ==================== RESPONSE BUILDER ====================

/**
 * Creates a paginated response with cursor metadata
 *
 * @param items - The items returned from the query (should fetch limit + 1)
 * @param config - Pagination configuration
 * @param getTimestamp - Function to extract timestamp from an item (createdAt, lastMessagedAt, etc.)
 * @param getId - Function to extract id from an item
 * @returns Paginated response with cursor information
 */
export function createPaginatedResponse<T>(
  items: T[],
  config: PaginationConfig,
  getTimestamp: (item: T) => Date,
  getId: (item: T) => string
): PaginatedResponse<T> {
  const hasMore = items.length > config.limit;
  const data = hasMore ? items.slice(0, config.limit) : items;

  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (data.length > 0) {
    const lastItem = data[data.length - 1];
    const firstItem = data[0];

    // Next cursor points to the last item for fetching more
    if (hasMore) {
      nextCursor = encodeCursor({
        id: getId(lastItem),
        timestamp: getTimestamp(lastItem).toISOString(),
      });
    }

    // Previous cursor points to the first item (useful for bidirectional pagination)
    if (config.cursor) {
      prevCursor = encodeCursor({
        id: getId(firstItem),
        timestamp: getTimestamp(firstItem).toISOString(),
      });
    }
  }

  return {
    data,
    pagination: {
      nextCursor,
      prevCursor,
      hasMore,
      limit: config.limit,
    },
  };
}

// ==================== HELPER FOR DRIZZLE QUERIES ====================

/**
 * Helper to apply cursor pagination to a Drizzle query
 * Use this to set the limit (fetches limit + 1 to check for more items)
 */
export function getPaginationLimit(config: PaginationConfig): number {
  return config.limit + 1;
}
