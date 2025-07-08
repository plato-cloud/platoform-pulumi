import * as k8s from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi"

export type Cluster= {
  name?: string
  endpoint: string,
  certificateAuthorityData: string
  user:{
    clientCertificateData: string,
    clientKeyData: string
  }
}

export const buildKubeconfig = (cluster: Cluster) => {
  const name = cluster.name || 'platoform-kubernetes'

  return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${cluster.certificateAuthorityData}
    server: ${cluster.endpoint}
    tls-server-name: kubernetes.default
  name: ${name}
contexts:
- context:
    cluster: ${name}
    user: ${name}-user
  name: ${name}
current-context: ${name}
kind: Config
preferences: {}
users:
- name: ${name}-user
  user:
    client-certificate-data: ${cluster.user.clientCertificateData}
    client-key-data: ${cluster.user.clientKeyData}`
}

type CsiDriverArgs = {
  provider: k8s.Provider
  resourceName?: string
  withSyncer?: boolean
}


export const defineCsiDriver = (args: CsiDriverArgs) => {
  const resourceName = args.resourceName || 'platoform'
  const withSyncer = 'withSyncer' in args ? args.withSyncer : true
  const provider = args.provider

  const csiDriver = new k8s.helm.v4.Chart(`${resourceName}-csi-driver`, {
    chart: 'cloudstack-csi',
    version: '2.3.0',
    namespace: 'kube-system',
    repositoryOpts: {
      repo: 'https://leaseweb.github.io/cloudstack-csi-driver',
    },
    values: {
      syncer: {
        enabled: withSyncer,
      },
      node: {
        metadataSource: "cloud-init",
      },
    }
  }, { provider });

  const result = {
    name: `${resourceName}-csi-driver`,
    namespace: 'kube-system',
  }

  Object.defineProperty(result, 'chart', {
    get: () => csiDriver,
    enumerable: false,
    configurable: true
  })

  return result
}

export type CertManagerArgs = {
  provider: k8s.Provider
  namespace?: string
  version?: string
  acme: {
    email: string
  }
  hostAliases?: {
    ip: string
    hostnames: string[]
  }[]
}

export const defineCertManager = (args: CertManagerArgs) => {
  const provider = args.provider
  const namespace = args.namespace || 'cert-manager'
  const version = args.version || 'v1.18.2'

  const ns = new k8s.core.v1.Namespace("cert-manager-namespace", {
    metadata: {
      name: namespace,
    },
  }, { provider });

  const certManager = new k8s.helm.v4.Chart("cert-manager", {
    chart: "cert-manager",
    version,
    namespace: ns.metadata.name,
    repositoryOpts: {
      repo: "https://charts.jetstack.io",
    },
    values: {
      crds: {
        enabled: true
      },
      hostAliases: args.hostAliases,
    }
  }, { provider });

  const letsEncryptIssuer = new k8s.apiextensions.CustomResource("letsencrypt-prod", {
    apiVersion: "cert-manager.io/v1",
    kind: "ClusterIssuer",
    metadata: {
      name: "letsencrypt-prod",
    },
    spec: {
      acme: {
        email: args.acme.email,
        server: "https://acme-v02.api.letsencrypt.org/directory",
        privateKeySecretRef: {
          name: "letsencrypt-prod-private-key",
        },
        solvers: [
          {
            http01: {
              ingress: {
                class: "nginx",
              },
            },
          },
        ],
      },
    },
  }, { provider, dependsOn: certManager });

  const result = {
    version,
    namespace: ns.metadata.name,
    issuer: letsEncryptIssuer.metadata.name,
  }

  Object.defineProperty(result, 'chart', {
    get: () => certManager,
    enumerable: false,
    configurable: true
  })

  return result
}

export type IngressControllerArgs ={
  provider: k8s.Provider
  version?: string
  namespace?: string
  tcpProxy?: Record<string, string>
  additionalServices?: number
  replicas?: number
}

export const defineIngressController = (args: IngressControllerArgs) => {
  const version = args.version || '4.12.2'
  const namespace = args.namespace || 'ingress-nginx'
  const provider = args.provider
  const controllerName = "ingress-nginx"

  const ns = new k8s.core.v1.Namespace("ingress-nginx-namespace", {
    metadata: {
      name: namespace,
    },
  }, { provider });

  const nginx = new k8s.helm.v4.Chart("ingress-nginx", {
    chart: "ingress-nginx",
    version,
    namespace: ns.metadata.name,
    repositoryOpts: {
      repo: "https://kubernetes.github.io/ingress-nginx",
    },
    values: {
      tcp: args.tcpProxy,
      controller: {
        replicaCount: args.replicas || 1,
      }
    },
  }, { provider });

  // Create additional LoadBalancer services pointing to the same nginx controller pods
  const additionalServices = []
  for (let i = 1; i <= (args.additionalServices || 0); i++) {
    const tcpPorts = Object.keys(args.tcpProxy || {}).map(port => ({
      name: `${port}-tcp`,
      port: parseInt(port),
      targetPort: `${port}-tcp`,
      protocol: "TCP" as const
    }))

    const extraService = new k8s.core.v1.Service(`ingress-nginx-controller-${i + 1}`, {
      metadata: {
        name: `${controllerName}-controller-${i + 1}`,
        namespace: ns.metadata.name,
        labels: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": controllerName,
          "app.kubernetes.io/name": "ingress-nginx",
          "app.kubernetes.io/part-of": "ingress-nginx",
        },
      },
      spec: {
        type: "LoadBalancer",
        selector: {
          "app.kubernetes.io/component": "controller",
          "app.kubernetes.io/instance": controllerName,
          "app.kubernetes.io/name": "ingress-nginx",
        },
        ports: [
          {
            name: "http",
            port: 80,
            targetPort: "http",
            protocol: "TCP",
            appProtocol: "http"
          },
          {
            name: "https",
            port: 443,
            targetPort: "https",
            protocol: "TCP",
            appProtocol: "https"
          },
          ...tcpPorts
        ],
        externalTrafficPolicy: "Cluster",
        internalTrafficPolicy: "Cluster",
        ipFamilyPolicy: "SingleStack",
      },
    }, { provider, dependsOn: nginx });

    additionalServices.push(extraService)
  }

  const result = {
    version,
    namespace: ns.metadata.name,
    additionalServices: additionalServices.length,
  }

  Object.defineProperty(result, 'chart', {
    get: () => nginx,
    enumerable: false,
    configurable: true
  })

  return result
}

export type MetricServerArgs = {
  provider: k8s.Provider
}

export const defineMetricsServer = (args: MetricServerArgs) => {
  const { provider } = args

  const operator = new k8s.yaml.v2.ConfigFile("metrics-server", {
    file: 'https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml',
  }, {
    provider,
    transforms: [
      (args) => {
        // Apply provider to all child resources
        let props = args.props

        // Add kubelet-insecure-tls flag to metrics-server deployment
        if (args.type === "kubernetes:apps/v1:Deployment" && args.name === "metrics-server:kube-system/metrics-server") {
          const containers = props.spec?.template?.spec?.containers
          if (containers && containers[0]?.name === "metrics-server") {
            containers[0].args = containers[0].args || []
            if (!containers[0].args.includes("--kubelet-insecure-tls")) {
              containers[0].args.push("--kubelet-insecure-tls")
            }
          }
        }

        return {
          props,
          opts: pulumi.mergeOptions(args.opts, { provider })
        }
      }
    ]
  });

  const result = {}

  Object.defineProperty(result, 'configFile', {
    get: () => operator,
    enumerable: false,
    configurable: true
  })

  return result
}

export type CloudNativePgArgs = {
  provider: k8s.Provider
}

export const defineCloudNativePG = (args: CloudNativePgArgs) => {
  const { provider } = args

  const operator = new k8s.yaml.v2.ConfigFile("cloudnative-pg", {
    file: 'https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v1.25.1/cnpg-1.25.1.yaml',
  }, { provider });

  const result = {}

  Object.defineProperty(result, 'configFile', {
    get: () => operator,
    enumerable: false,
    configurable: true
  })

  return result
}

export type EcrSecretsOperatorArgs = {
  provider: k8s.Provider,
  namespace?: string
  version?: string
}

export const defineEcrSecretsOperator = (args: EcrSecretsOperatorArgs) => {
  const version = args.version || '0.1.4'
  const namespace = args.namespace || "ecr-secrets-operator"
  const provider = args.provider

  const ns = new k8s.core.v1.Namespace("ecr-secrets-operator-system-ns", {
    metadata: {
      name: namespace,
    },
  }, { provider });

  const ecrChart = new k8s.helm.v4.Chart("ecr-secrets-operator-system", {
    chart: "kube-ecr-secrets-operator",
    version,
    namespace: ns.metadata.name,
    repositoryOpts: {
      repo: "https://zak905.github.io/kube-ecr-secrets-operator/repo-helm",
    },
    values: {},
  }, { provider });

  const result = {
    version,
    namespace: ns.metadata.name,
  }

  Object.defineProperty(result, 'chart', {
    get: () => ecrChart,
    enumerable: false,
    configurable: true
  })

  return result
}
