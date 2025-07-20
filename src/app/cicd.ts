import type { Application, Cluster, FactoryContext } from './types'
import * as k8s from "@pulumi/kubernetes"

export const defineCICD = (app: Application, namespace: string, cluster: Cluster, factoryConfig: FactoryContext) => {
  if (!factoryConfig.cicd?.getDeployServiceAccount) {
    return { skipped: true };
  }

  const deployServiceAccount = factoryConfig.cicd.getDeployServiceAccount(cluster);

  if (!deployServiceAccount) {
    return { skipped: true };
  }

  const role = new k8s.rbac.v1.Role(`${app.name}-github-role`, {
    metadata: {
      name: "github-deployer",
      namespace,
    },
    rules: [
      {
        apiGroups: ["apps"],
        resources: ["deployments"],
        verbs: ["get", "list", "patch", "update"],
      },
      {
        apiGroups: [""],
        resources: ["pods"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: [""],
        resources: ["pods/log"],
        verbs: ["get", "list"],
      },
      {
        apiGroups: ["batch"],
        resources: ["jobs"],
        verbs: ["get", "list", "create", "delete", "watch"],
      },
      {
        apiGroups: ["batch"],
        resources: ["cronjobs"],
        verbs: ["get", "list", "patch", "update"],
      },
    ],
  }, { provider: cluster.provider });

  const roleBinding = new k8s.rbac.v1.RoleBinding(`${app.name}-github-binding`, {
    metadata: {
      name: "github-deployer",
      namespace,
    },
    subjects: [{
      kind: "ServiceAccount",
      name: deployServiceAccount.apply(sa => sa.name),
      namespace: deployServiceAccount.apply(sa => sa.namespace),
    }],
    roleRef: {
      kind: "Role",
      name: role.metadata.name,
      apiGroup: "rbac.authorization.k8s.io",
    },
  }, { provider: cluster.provider });

  return {
    role: {
      name: role.metadata.name,
      subjects: roleBinding.subjects
    }
  };
}
