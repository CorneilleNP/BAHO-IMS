// Display colours/labels for stock receipt statuses, shared by list, drawer and wizard.
export const qualityColor = { PENDING: 'yellow', ACCEPTED: 'green', REJECTED: 'red' } as const;
export const qualityLabel = { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected' } as const;
export const processingColor = { NOT_STARTED: 'gray', IN_PROGRESS: 'blue', COMPLETED: 'teal' } as const;
export const processingLabel = { NOT_STARTED: 'Not started', IN_PROGRESS: 'Partially processed', COMPLETED: 'Completed' } as const;
