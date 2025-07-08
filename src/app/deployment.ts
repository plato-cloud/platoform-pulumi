import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes"

import type { ApplicationIngress, DeploymentScaler, Cluster, FactoryContext } from './types'
import { defineScaler } from './scaler'
import { deepMerge } from '../utils'

export type DeploymentArgs = {
  name: string;
  image: string;
  tag?: string;
  containerPort?: number;
  containerOverride?: pulumi.Input<Partial<kubernetes.types.input.core.v1.Container>>;
  deploymentOverride?: pulumi.Input<Partial<kubernetes.apps.v1.DeploymentArgs>>;
  ingress?: ApplicationIngress;
  scaler?: DeploymentScaler;
  secrets?: string | null;
}

export const defineDeployment = (
  args: DeploymentArgs,
  namespace: string,
  cluster: Cluster,
  factoryConfig: FactoryContext
) => {
  const {
    name,
    image,
    tag = 'latest',
    containerPort,
    containerOverride = {},
    deploymentOverride = {},
    ingress,
    scaler,
    secrets
  } = args;

  if (ingress && !containerPort) {
    throw new Error(`Container port must be defined when using ingress for application ${name}`)
  }

  const probe = containerPort && ingress?.healthCheck ? {
    httpGet: {
      path: ingress?.healthCheck,
      port: containerPort
    }
  } : undefined;

  const baseContainer: kubernetes.types.input.core.v1.Container = {
    name,
    image: `${image}:${tag}`,
    ports: containerPort ? [{
      containerPort,
      name: 'http',
      protocol: 'TCP',
    }] : undefined,
    envFrom: secrets ? [{
      secretRef: {
        name: secrets,
      },
    }] : undefined,
    livenessProbe: probe,
    readinessProbe: probe,
  };

  const mergedContainer = deepMerge(baseContainer, containerOverride);

  const baseDeployment: kubernetes.apps.v1.DeploymentArgs = {
    metadata: {
      name,
      namespace,
      labels: {
        'app.kubernetes.io/name': name,
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': name,
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': name,
          },
        },
        spec: {
          containers: [mergedContainer],
        },
      },
    },
  };

  const finalDeployment = deepMerge(baseDeployment, deploymentOverride);

  const deployment = new kubernetes.apps.v1.Deployment(name, finalDeployment, {
    provider: cluster.provider,
    ignoreChanges: ['spec.replicas', 'spec.template.spec.containers[0].image'],
  });

  // Create service if specified
  let exposedService;
  if (ingress && containerPort) {
    if (!factoryConfig.exposeService) {
      throw new Error(`exposeService is required when ingress is configured for deployment ${name}`)
    }
    exposedService = factoryConfig.exposeService(cluster, { ...args, namespace, name, containerPort, ingress });
  }

  // Create scaler if specified
  let deploymentScaler;
  if (scaler) {
    deploymentScaler = defineScaler(name, scaler, namespace, cluster);
  }

  return {
    name: deployment.metadata.name,
    containerPort,
    ingress: exposedService,
    scaler: deploymentScaler,
  };
};
