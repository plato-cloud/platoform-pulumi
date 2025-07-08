import * as kubernetes from './kubernetes'
import * as app from './app'

export const Kubernetes = kubernetes
export const Application = app

// Export ApplicationFactory directly for cleaner interface
export { ApplicationFactory } from './app/index'

export type { Cluster, ServiceArgs, FactoryContext, Domain } from './app/types'
