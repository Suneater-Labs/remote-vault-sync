// Process items in chunks
export async function batch<T>(
  items: T[],
  size: number,
  process: (chunk: T[]) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await process(items.slice(i, i + size));
  }
}

// Fetch paginated results
export async function paginate<TRequest, TResponse, TItem>(
  request: TRequest,
  fetch: (req: TRequest) => Promise<TResponse>,
  getItems: (res: TResponse) => TItem[] | undefined,
  getNextToken: (res: TResponse) => string | undefined,
  setNextToken: (req: TRequest, token: string) => TRequest
): Promise<TItem[]> {
  const items: TItem[] = [];
  let currentRequest = request;

  while (true) {
    const response = await fetch(currentRequest);
    const pageItems = getItems(response) ?? [];
    items.push(...pageItems);

    const nextToken = getNextToken(response);
    if (!nextToken) break;

    currentRequest = setNextToken(currentRequest, nextToken);
  }

  return items;
}
