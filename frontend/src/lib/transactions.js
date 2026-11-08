let notifier = null;

export function setTransactionNotifier(nextNotifier) {
  notifier = nextNotifier;
}

export async function sendAndWait(transactionPromise) {
  const transaction = await transactionPromise;
  notifier?.({ phase: "pending", hash: transaction.hash });
  const receipt = await transaction.wait();
  notifier?.({ phase: "confirmed", hash: transaction.hash, receipt });
  return receipt;
}
