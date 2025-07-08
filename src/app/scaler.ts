import * as k8s from "@pulumi/kubernetes"
import type { Cluster } from './types'

export type DeploymentScaler = {
  minReplicas: number,
  maxReplicas: number,
  targetCPUUtilization: number
}

export const defineScaler = (
  target: string,
  scaler: DeploymentScaler,
  namespace: string,
  cluster: Cluster
) => {
  new k8s.autoscaling.v2.HorizontalPodAutoscaler(target, {
    metadata: {
      name: `for-${target}`,
      namespace,
      labels: {
        'app.kubernetes.io/name': target,
      },
    },
    spec: {
      scaleTargetRef: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        name: target,
      },
      minReplicas: scaler.minReplicas,
      maxReplicas: scaler.maxReplicas,
      metrics: [
        {
          type: "Resource",
          resource: {
            name: "cpu",
            target: {
              type: "Utilization",
              averageUtilization: scaler.targetCPUUtilization,
            },
          },
        },
      ],
    },
  }, { provider: cluster.provider })

  return scaler
}
