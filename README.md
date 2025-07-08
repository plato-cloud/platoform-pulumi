# @platoform/pulumi-helper

A TypeScript library providing high-level abstractions for Pulumi-based Kubernetes application deployments. Simplifies application setup with built-in services, deployments, and CI/CD patterns.

## Features

- 🚀 **Application Factory Pattern**: Consistent application deployment with dependency injection
- 📦 **Built-in Services**: Redis service with configurable version and deep merge chart values
- 🔧 **Custom Services**: Extensible service system for project-specific needs
- 🛡️ **Type Safety**: Full TypeScript support with proper type inference
- 📈 **Auto-scaling**: Horizontal pod autoscaling with configurable parameters
- 🔄 **CI/CD Ready**: Integrated CI/CD role-based access control
- 🌐 **Service Exposure**: Configurable ingress and load balancer management

## Installation

```bash
npm install @platoform/pulumi-helper
```

## Quick Start

### 1. Create Application Factory

```typescript
import { ApplicationFactory } from '@platoform/pulumi-helper'

const appFactory = new ApplicationFactory({
  getStorageClass: (cluster, type) => {
    // Return storage class name based on cluster and type ('fast' | 'cheap')
    return type === 'fast' ? 'ssd' : 'standard'
  },

  exposeService: (cluster, deployment) => {
    // Handle service exposure - create ingress, load balancer, etc.
    return {
      service: "my-service",
      ingress: "my-ingress",
      loadBalancer: {
        address: "1.2.3.4"
      }
    }
  },

  cicd: {
    getDeployServiceAccount: (cluster) => {
      // Return service account for CI/CD deployments
      if (cluster.platform === 'my-platform') {
        return getServiceAccount()
      }
      return null
    }
  },

  services: {
    // Custom project-specific services
    storage: storageService,
    database: databaseService
  }
})
```

### 2. Define Applications

```typescript
const app = appFactory.defineApplication({
  name: "my-web-app",
  namespace: "production",
  repository: "my-org/my-app",

  // Built-in and custom services
  services: {
    redis: appFactory.services.redis({
      version: "7.0.0",
      chartValues: {
        resources: {
          requests: { memory: "512Mi" }
        }
      }
    }),
    storage: appFactory.services.storage({ name: "app-storage" }),
    database: appFactory.services.database({ size: "20Gi" })
  },

  // Environment variables with service access
  environment: (services) => ({
    REDIS_URL: services.redis.url,
    DATABASE_URL: services.database.connectionString,
    STORAGE_BUCKET: services.storage.bucket
  }),

  // Application deployments
  deployments: [{
    name: "web",
    image: "my-org/my-app",
    tag: "v1.2.3",
    containerPort: 3000,

    // Ingress configuration
    domains: [
      { subdomain: "api", zone: "example.com" },
      { subdomain: "www", zone: "example.com" }
    ],
    healthCheck: "/health",
    annotations: {
      "cert-manager.io/cluster-issuer": "letsencrypt-prod"
    },

    // Auto-scaling
    scaler: {
      minReplicas: 2,
      maxReplicas: 10,
      targetCPUUtilization: 70
    }
  }],

  // Enable CI/CD
  cicd: true
}, cluster)
```

## Built-in Services

### Redis Service

The library includes a Redis service with configurable version and deep merge support for chart values:

```typescript
services: {
  redis: appFactory.services.redis({
    version: "7.0.0",           // Optional: Redis chart version
    release: "my-redis",        // Optional: Helm release name
    chartValues: {              // Optional: Deep merged with defaults
      resources: {
        requests: { memory: "1Gi" },
        limits: { memory: "2Gi" }
      },
      persistence: {
        size: "10Gi"
      }
    }
  })
}
```

**Default Configuration:**
- Architecture: standalone
- Cluster mode: disabled
- Persistence: 20Gi with fast storage class
- Password: auto-generated random password

**Returns:**
```typescript
{
  url: string  // Redis connection URL with credentials
}
```

## Custom Services

Create custom services that follow the ServiceArgs pattern:

```typescript
// my-service.ts
import type { ServiceArgs } from '@platoform/pulumi-helper'

type MyServiceArgs = {
  size: string
  public?: boolean
}

type MyServiceResult = {
  endpoint: string
  credentials: string
}

export default (args: MyServiceArgs) => ({ namespace, cluster, context }: ServiceArgs): MyServiceResult => {
  // Access cluster information
  const storageClass = context.getStorageClass(cluster, 'fast')

  // Create resources using namespace and cluster.provider
  const resource = new SomeResource(`${args.size}-resource`, {
    // ...
  }, { provider: cluster.provider })

  return {
    endpoint: resource.endpoint,
    credentials: resource.credentials
  }
}
```

Register custom services in the factory:

```typescript
const appFactory = new ApplicationFactory({
  // ... other config
  services: {
    myService: myServiceFunction,
    anotherService: anotherServiceFunction
  }
})
```

## Types

### Core Types

```typescript
type FactoryContext = {
  getStorageClass: (cluster: Cluster, type: 'fast' | 'cheap') => string
  exposeService?: (cluster: Cluster, deployment: ExposedServiceArgs) => ExposedServiceResult
  cicd?: {
    getDeployServiceAccount: (cluster: Cluster) => pulumi.Output<{ name: string; namespace: string }> | null
  }
  services?: Record<string, Function>
}

type Cluster = {
  platform: string
  provider: kubernetes.Provider
}

type ServiceArgs = {
  namespace: string
  cluster: Cluster
  context: FactoryContext
}
```

### Application Types

```typescript
type Application = {
  name: string
  namespace?: string
  repository?: string
  environment?: Environment | ((services: any) => Environment)
  services?: { [key: string]: Service }
  deployments?: DeploymentConfig[]
  cicd?: boolean
}

type DeploymentConfig = {
  name?: string
  image: string
  tag?: string
  containerPort?: number
  containerOverride?: pulumi.Input<Partial<kubernetes.types.input.core.v1.Container>>
  deploymentOverride?: pulumi.Input<Partial<kubernetes.apps.v1.DeploymentArgs>>
  domains?: Domain[]
  healthCheck?: string
  annotations?: Record<string, string>
  scaler?: DeploymentScaler
}
```

## Advanced Usage

### Deep Merge Chart Values

The Redis service (and custom services using the utility) supports deep merging:

```typescript
// Default values are merged with your overrides
redis: appFactory.services.redis({
  chartValues: {
    // This will be deep merged with defaults, not replaced
    master: {
      persistence: {
        size: "50Gi"  // Only size is overridden, storageClass kept from defaults
      }
    },
    // New values are added
    serviceAccount: {
      create: false
    }
  }
})
```

### Conditional Service Configuration

```typescript
services: {
  redis: appFactory.services.redis({
    version: stack === 'production' ? '7.0.0' : '6.2.0',
    chartValues: stack === 'production' ? {
      resources: {
        requests: { memory: "2Gi" },
        limits: { memory: "4Gi" }
      }
    } : {}
  })
}
```

### Error Handling

The library throws descriptive errors for missing required configuration:

```typescript
// Will throw: "exposeService is required when ingress is configured for deployment web"
deployments: [{
  domains: [{ subdomain: "api", zone: "example.com" }],
  // ... but exposeService not configured in factory
}]
```

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Build and watch for changes
npm run dev

# Link for local development
npm link
```

## Migration Guide

### From Previous Versions

- `String` type removed - use `pulumi.Input<string>` directly
- Services now receive `{ namespace, cluster, context }` instead of `{ k8s: { ... } }`
- `exposeService` now receives `(cluster, deployment)` instead of `(cluster, args)`
- Custom services should follow the new ServiceArgs pattern

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Test with real Pulumi deployments
5. Submit a pull request

## License

GPL-3.0 License - see [LICENSE](LICENSE) file for details.
