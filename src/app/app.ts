import * as k8s from "@pulumi/kubernetes"

import { defineDeployment } from './deployment'
import { defineCICD } from './cicd'
import type { Environment, Application, Cluster, FactoryContext } from './types'

export default (app: Application, cluster: Cluster, factoryConfig: FactoryContext) => {
  const provider = cluster.provider

  const namespace = app?.namespace || app.name;
  new k8s.core.v1.Namespace(
    namespace,
    {
      metadata: { name: namespace },
    },
    { provider }
  );

  const defineServices = (): [any, Environment] => {
    const services = Object.fromEntries(
      Object.entries(app.services || {}).map(([name, service]) => {
        return [name, service({
          applicationName: app.name,
          namespace,
          cluster,
          context: factoryConfig
        })]
      })
    )

    return [
      services,
      typeof app.environment === "function" ? app.environment(services) : app.environment
    ]
  }

  const defineSecrets = (environment: Environment) => {
    if (!environment) {
      return null
    }

    return new k8s.core.v1.Secret(app.name, {
      stringData: environment,
      metadata: {
        name: `for-${app.name}`,
        namespace,
      }
    }, { provider }).metadata.name
  }


  const [services, environment] = defineServices();

  const secrets = defineSecrets(environment);

  // Handle deployments array
  const deployments = (app.deployments || []).map((deploymentConfig) =>
    defineDeployment({
      name: app.name,
      secrets,
      ...deploymentConfig
    }, namespace, cluster, factoryConfig)
  );

  const cicd = app.cicd !== false ? defineCICD(app, namespace, cluster, factoryConfig) : undefined;

  return {
    namespace,
    secrets,
    services,
    deployments,
    cicd,
  };
};
