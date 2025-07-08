import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"
import * as random from "@pulumi/random"
import type { ServiceArgs } from './types'
import { deepMerge } from '../utils'

type RedisService = {
  url: pulumi.Input<string>
}

type RedisArgs = {
  name?: string,
  version?: string,
  chartValues?: any,
  pulumiOptions?: pulumi.ResourceOptions
}

export default (args: RedisArgs = {}) => ({ applicationName, namespace, cluster, context }: ServiceArgs): RedisService => {
  const name = [args.name || applicationName, 'redis'].filter(Boolean).join('-')
  const password = new random.RandomPassword(`${name}-password`, { length: 20 });

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
        }
      },
      global: {
        storageClass: context.getStorageClass(cluster, 'fast'),
        redis: {
          password: password.result,
        },
      },
    }, args.chartValues || {}),
  }, pulumi.mergeOptions({ provider: cluster.provider }, args.pulumiOptions))

  return {
    url: pulumi
      .all([password.result, `${name}-master`])
      .apply(([password, host]) => `redis://:${encodeURIComponent(password)}@${host}`)
  }
}
