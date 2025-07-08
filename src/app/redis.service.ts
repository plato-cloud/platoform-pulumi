import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"
import * as random from "@pulumi/random"
import type { ServiceArgs, FactoryContext } from './types'
import { deepMerge } from '../utils'

type RedisService = {
  url: pulumi.Input<string>
}

type RedisArgs = {
  release?: string,
  version?: string,
  chartValues?: any,
}

export default (args: RedisArgs = {}) => ({ namespace, cluster, context }: ServiceArgs): RedisService => {
  const name = [args.release, namespace, 'redis'].filter(Boolean).join('-')
  const password = new random.RandomPassword(`${namespace}-password`, { length: 20 });

  const storageClass = context.getStorageClass(cluster, 'fast')

  new k8s.helm.v3.Chart(name, {
    chart: 'redis',
    version: args.version || '18.4.0',
    namespace,
    fetchOpts: {
      repo: "https://charts.bitnami.com/bitnami",
    },
    values: deepMerge({
      architecture: 'standalone',
      cluster: {
        enabled: false,
      },
      master: {
        persistence: {
          size: '20Gi',
          storageClass: storageClass
        }
      },
      global: {
        redis: {
          password: password.result,
        },
      },
    }, args.chartValues || {}),
  }, { provider: cluster.provider });

  return {
    url: pulumi
      .all([password.result, `${name}-master`])
      .apply(([password, host]) => `redis://:${encodeURIComponent(password)}@${host}`)
  }
}
