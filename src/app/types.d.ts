import * as kubernetes from "@pulumi/kubernetes"
import * as pulumi from "@pulumi/pulumi"

export type DeploymentScaler = {
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
};

export type Cluster = {
  platform: string;  // Defined by client, could be 'platoform', 'google', 'aws', etc.
  provider: kubernetes.Provider;
  stackReference?: pulumi.StackReference;
}

export type ExposedServiceArgs = DeploymentConfig & {
  name: string
  containerPort: number
  ingress: ApplicationIngress
}

export type ExposedServiceResult = {
  service: pulumi.Input<string>
  ingress: pulumi.Input<string>
  loadBalancer: {
    address: pulumi.Input<string>
  }
} & Record<string, any>

export type FactoryContext = {
  getStorageClass: (cluster: Cluster, type: 'fast' | 'cheap') => string
  exposeService?: (cluster: Cluster, deployment: ExposedServiceArgs) => ExposedServiceResult
  cicd?: {
    getDeployServiceAccount: (cluster: Cluster) => pulumi.Output<{ name: string; namespace: string }> | null
  }
  services?: Record<string, Function>
}

export type ServiceArgs = {
  applicationName: string
  namespace: string
  cluster: Cluster
  context: FactoryContext
}

export type Service = (args: ServiceArgs) => any

export type Domain = {
  zone: string
  subdomain: string
}

export type ApplicationIngress = {
  domains: Domain[];
  healthCheck?: string;
  annotations?: Record<string, string>;
};

export type DeploymentConfig = {
  name?: string;
  image: string;
  tag?: string;
  containerPort?: number;
  containerOverride?: pulumi.Input<Partial<kubernetes.types.input.core.v1.Container>>;
  deploymentOverride?: pulumi.Input<Partial<kubernetes.apps.v1.DeploymentArgs>>;
  ingress?: ApplicationIngress;
  scaler?: DeploymentScaler;
};

export type Environment = { [key: string]: pulumi.Input<string> } | undefined;

export type Application = {
  name: string;
  namespace?: string;
  repository?: string;
  environment?: Environment | ((services: any) => Environment);
  services?: { [key: string]: Service };
  deployments?: DeploymentConfig[];
  cicd?: boolean;
};
