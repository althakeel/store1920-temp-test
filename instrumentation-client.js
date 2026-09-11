import { installDomReconcileGuard } from './lib/domReconcileError';

// Runs synchronously before React hydrates so removeChild races never reach the overlay.
installDomReconcileGuard();
