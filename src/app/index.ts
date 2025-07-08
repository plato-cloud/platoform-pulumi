import defineApplication from './app'
import type { Application, Cluster, FactoryContext } from './types'
import defineRedis from './redis.service'

export class ApplicationFactory {
  private config: FactoryContext
  public services: Record<string, Function>

  constructor(config: FactoryContext) {
    this.config = config

    this.services = {
      redis: defineRedis,

      ...(config.services || {})
    }
  }

  defineApplication = (app: Application, cluster: Cluster) => {
    return defineApplication(app, cluster, this.config)
  }
}
