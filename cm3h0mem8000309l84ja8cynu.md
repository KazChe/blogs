---
title: "Faker.js to Populate Your Database with Realistic Test Data"
seoTitle: "Generate Realistic Test Data with Faker.js"
seoDescription: "Generate realistic test data with Faker.js, a versatile library perfect for database seeding with extensive locale support and customization options"
datePublished: 2024-11-14T07:55:27.488Z
cuid: cm3h0mem8000309l84ja8cynu
slug: fakerjs-to-populate-your-database-with-realistic-test-data
cover: https://cdn.hashnode.com/res/hashnode/image/upload/v1731569345242/4171954e-f542-436e-a5f4-5524c79b2eb6.png
ogImage: https://cdn.hashnode.com/res/hashnode/image/upload/v1731569511955/50be510a-4ea2-4bb0-a282-a7d8190e4c8a.png
tags: fakerjs

---

# Introduction

Faker.js is a powerful library that generates massive amount of real-life-fake-data for testing and development purposes. When building applications, striving for having realistic test data is crucial for proper development and testing.  
  
Github repository: [https://github.com/KazChe/fakerjs-ramblings](https://github.com/KazChe/fakerjs-ramblings)

## Key Features and Benefits

* Generates realistic data across many categories (names, emails, addresses, etc.)
    
* Supports multiple locales for internationalized data
    
* Highly customizable and extensible
    
* Perfect for seeding development databases
    
* Helps avoid manual data entry for testing
    

## Common Use Cases

```javascript
// Generate user data
const user = {
  name: faker.person.fullName(),
  email: faker.internet.email(),
  avatar: faker.image.avatar(),
  address: faker.location.streetAddress(),
  bio: faker.lorem.paragraph()
};

// Generate product data
const product = {
  name: faker.commerce.productName(),
  price: faker.commerce.price(),
  description: faker.commerce.productDescription(),
  category: faker.commerce.department()
};
```

## Integration with Database Seeding

```javascript
const createFakeUser = () => ({
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent()
});

// Generate 1000 users
exports.seed = async function(knex) {
  const fakeUsers = Array.from({ length: 1000 }, createFakeUser);
  await knex('users').insert(fakeUsers);
};
```

## Best Practices

1. **Seed Data Consistency**: Use fixed seeds for reproducible results
    

```javascript
faker.seed(123); // Sets a fixed seed for consistent results
```

2. **Relationships**: Maintain referential integrity when seeding related tables
    
    ```javascript
    const userId = faker.string.uuid();
    const user = {
      id: userId,
      name: faker.person.fullName()
    };
    const userPost = {
      title: faker.lorem.sentence(),
      userId: userId // Maintains relationship
    };
    ```
    
    3. **Locale Support**: Use appropriate locales for international
        

```javascript
faker.setLocale('es'); // Spanish data
faker.setLocale('de'); // German data
```

## Advanced Database Seeding Patterns

### 1\. Relationships and Foreign Keys

```javascript
// Create consistent relationships between tables
const createCompanyWithEmployees = () => {
  const companyId = faker.string.uuid();
  
  const company = {
    id: companyId,
    name: faker.company.name(),
    catchPhrase: faker.company.catchPhrase(),
    industry: faker.company.buzzNoun()
  };

  const employees = Array.from({ length: faker.number.int({ min: 5, max: 20 }) }, () => ({
    id: faker.string.uuid(),
    companyId: companyId,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    role: faker.person.jobTitle(),
    department: faker.commerce.department(),
    salary: faker.number.int({ min: 30000, max: 150000 })
  }));

  return { company, employees };
};
```

### 2\. Custom Generators for Domain-Specific Data

```javascript
// Extend Faker with your own generators
const customGenerator = {
  projectStatus() {
    return faker.helpers.arrayElement(['PLANNING', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']);
  },
  
  sprintNumber() {
    return `SP-${faker.number.int({ min: 1, max: 999 })}`;
  },
  
  ticketPriority() {
    return faker.helpers.weightedArrayElement([
      { weight: 0.1, value: 'CRITICAL' },
      { weight: 0.2, value: 'HIGH' },
      { weight: 0.4, value: 'MEDIUM' },
      { weight: 0.3, value: 'LOW' }
    ]);
  }
};
```

### 3\. Batch Processing for Large Datasets

```javascript
async function seedLargeDataset(knex, batchSize = 1000) {
  const totalRecords = 1000000;
  const batches = Math.ceil(totalRecords / batchSize);
  
  console.log(`Seeding ${totalRecords} records in ${batches} batches`);
  
  for (let i = 0; i < batches; i++) {
    const records = Array.from({ length: batchSize }, () => ({
      id: faker.string.uuid(),
      data: faker.helpers.multiple(createFakeData, { count: 5 })
    }));
    
    await knex('large_table').insert(records);
    console.log(`Completed batch ${i + 1}/${batches}`);
  }
}
```

### 4\. Locale-Aware Seeding

```javascript
const seedInternationalUsers = async (knex) => {
  const locales = ['en', 'es', 'fr', 'de', 'ja'];
  
  for (const locale of locales) {
    faker.setLocale(locale);
    
    const users = Array.from({ length: 100 }, () => ({
      name: faker.person.fullName(),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      phone: faker.phone.number(),
      locale: locale
    }));
    
    await knex('international_users').insert(users);
  }
};
```

### 5\. Consistent Test Data

```javascript
function setupTestData() {
  // Set a fixed seed for reproducible test data
  faker.seed(123);
  
  const testUser = {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    username: faker.internet.userName(),
    profile: {
      avatar: faker.image.avatar(),
      bio: faker.person.bio(),
      location: faker.location.city()
    }
  };
  
  return testUser;
}
```

## Basic Setup

```javascript
import { faker } from '@faker-js/faker';

// Optional: Set a seed for reproducible results
faker.seed(123);
```

## More Advanced Data Generation Examples

### 1\. A User Profiles with Related Data

```javascript
const createUserProfile = () => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  
  return {
    id: faker.string.uuid(),
    firstName,
    lastName,
    email: faker.internet.email({ firstName, lastName }),
    avatar: faker.image.avatar(),
    job: {
      title: faker.person.jobTitle(),
      area: faker.person.jobArea(),
      type: faker.person.jobType(),
      descriptor: faker.person.jobDescriptor()
    },
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      coordinates: {
        lat: faker.location.latitude(),
        lng: faker.location.longitude()
      }
    },
    internet: {
      username: faker.internet.userName({ firstName, lastName }),
      password: faker.internet.password(),
      userAgent: faker.internet.userAgent()
    }
  };
};
```

### 2\. E-commerce Product Data

```javascript
const createProduct = () => ({
  id: faker.string.uuid(),
  name: faker.commerce.productName(),
  description: faker.commerce.productDescription(),
  price: faker.commerce.price(),
  category: faker.commerce.department(),
  images: Array.from({ length: 3 }, () => ({
    url: faker.image.url(),
    alt: faker.lorem.sentence(),
    isPrimary: faker.datatype.boolean()
  })),
  metadata: {
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    stock: faker.number.int({ min: 0, max: 1000 }),
    sku: faker.string.alphanumeric(8).toUpperCase()
  }
});
```

### 3\. Company Data with Business Logic

```javascript
const createCompany = () => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  catchPhrase: faker.company.catchPhrase(),
  description: `${faker.company.buzzPhrase()} ${faker.company.buzzVerb()} ${faker.company.buzzAdjective()}`,
  employees: Array.from(
    { length: faker.number.int({ min: 5, max: 20 }) },
    createUserProfile
  ),
  contacts: {
    email: faker.internet.email(),
    phone: faker.phone.number(),
    website: faker.internet.url()
  },
  address: {
    headquarters: faker.location.streetAddress(true),
    coordinates: {
      lat: faker.location.latitude(),
      lng: faker.location.longitude()
    }
  }
});
```

### 4\. Database Seeding with Relationships

```javascript
async function seedDatabase(knex) {
  // Ensure consistent data with seed
  faker.seed(123);

  // Create companies first
  const companies = Array.from({ length: 10 }, createCompany);
  await knex('companies').insert(companies);

  // Create users with company relationships
  const users = companies.flatMap(company => 
    Array.from({ length: faker.number.int({ min: 5, max: 20 }) }, () => ({
      ...createUserProfile(),
      companyId: company.id
    }))
  );
  await knex('users').insert(users);

  // Create products with company relationships
  const products = companies.flatMap(company =>
    Array.from({ length: faker.number.int({ min: 10, max: 50 }) }, () => ({
      ...createProduct(),
      manufacturerId: company.id
    }))
  );
  await knex('products').insert(products);
}
```

## Performance Considerations

* Use batch inserts for large datasets
    
* Consider using streams for very large datasets
    
* Cache repeated random generations
    
* Use faker.helpers.multiple() for generating arrays of data
    

Real Example - See GitHub Repository

```javascript
src/
├── config/
│ ├── database.js # Database configuration
│ └── schema.sql # SQL schema definitions
├── models/
│ ├── index.js # Model relationships
│ ├── User.js # User model
│ ├── Company.js # Company model
│ └── Product.js # Product model
├── seeds/
│ ├── seed-database.js # Main seeder
│ ├── seed-large-dataset.js # Large dataset seeder
│ └── seed-international-users.js # International seeder
└── scripts/
└── init-db.js # Database initialization
```