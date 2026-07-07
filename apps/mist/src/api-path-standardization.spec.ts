import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ChanController } from './chan/chan.controller';
import { CollectorController } from './collector/collector.controller';
import { IndicatorController } from './indicator/indicator.controller';
import { SecurityController } from './security/security.controller';
import { SecurityV1AliasController } from './security/security-v1-alias.controller';

type RouteMetadata = {
  method: RequestMethod;
  path: string;
};

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [''];
  return Array.isArray(value) ? value : [value];
}

function normalizePath(...segments: string[]): string {
  return `/${segments
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/')}`;
}

function getRoutes(controller: object): RouteMetadata[] {
  const controllerPrefixes = toArray(
    Reflect.getMetadata(PATH_METADATA, controller) as string | string[],
  );
  const prototype = (controller as { prototype: object }).prototype;

  return Object.getOwnPropertyNames(prototype)
    .filter((property) => property !== 'constructor')
    .flatMap((property) => {
      const handler = prototype[property as keyof typeof prototype];
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod;
      const paths = toArray(
        Reflect.getMetadata(PATH_METADATA, handler) as string | string[],
      );

      if (method === undefined) return [];

      return controllerPrefixes.flatMap((prefix) =>
        paths.map((path) => ({
          method,
          path: normalizePath(prefix, path),
        })),
      );
    });
}

function expectRoute(
  routes: RouteMetadata[],
  method: RequestMethod,
  path: string,
): void {
  expect(routes).toContainEqual({ method, path });
}

describe('Mist API path standardization', () => {
  it('registers preferred security v1 aliases', () => {
    const routes = getRoutes(SecurityV1AliasController);

    expectRoute(routes, RequestMethod.POST, '/v1/securities');
    expectRoute(routes, RequestMethod.GET, '/v1/securities');
    expectRoute(routes, RequestMethod.GET, '/v1/securities/:code');
    expectRoute(routes, RequestMethod.POST, '/v1/security-sources');
    expectRoute(routes, RequestMethod.DELETE, '/v1/security-sources');
    expectRoute(routes, RequestMethod.GET, '/v1/securities/:code/sources');
    expectRoute(routes, RequestMethod.PUT, '/v1/securities/:code/deactivate');
    expectRoute(routes, RequestMethod.PUT, '/v1/securities/:code/activate');
  });

  it('keeps legacy security routes registered', () => {
    const routes = getRoutes(SecurityController);

    expectRoute(routes, RequestMethod.POST, '/security/v1/initialize');
    expectRoute(routes, RequestMethod.GET, '/security/v1/all');
    expectRoute(routes, RequestMethod.GET, '/security/v1/:code');
    expectRoute(routes, RequestMethod.POST, '/security/v1/sources');
    expectRoute(routes, RequestMethod.DELETE, '/security/v1/sources');
    expectRoute(routes, RequestMethod.GET, '/security/v1/:code/sources');
    expectRoute(routes, RequestMethod.PUT, '/security/v1/:code/deactivate');
    expectRoute(routes, RequestMethod.PUT, '/security/v1/:code/activate');
  });

  it('registers preferred and legacy indicator routes on the same handlers', () => {
    const routes = getRoutes(IndicatorController);

    for (const suffix of ['macd', 'kdj', 'rsi', 'k']) {
      expectRoute(routes, RequestMethod.POST, `/indicator/${suffix}`);
      expectRoute(routes, RequestMethod.POST, `/v1/indicators/${suffix}`);
    }
  });

  it('registers preferred and legacy Chan routes on the same handlers', () => {
    const routes = getRoutes(ChanController);

    for (const suffix of ['merge-k', 'bi', 'fenxing', 'channel']) {
      expectRoute(routes, RequestMethod.POST, `/chan/${suffix}`);
      expectRoute(routes, RequestMethod.POST, `/v1/chan/${suffix}`);
    }
  });

  it('keeps the collector collection route unchanged', () => {
    const routes = getRoutes(CollectorController);

    expectRoute(routes, RequestMethod.POST, '/v1/collector/collect');
  });

  it('keeps gateway prefixes outside backend controller route metadata', () => {
    const routes = [
      ...getRoutes(SecurityV1AliasController),
      ...getRoutes(SecurityController),
      ...getRoutes(IndicatorController),
      ...getRoutes(ChanController),
      ...getRoutes(CollectorController),
    ];

    expect(routes.map((route) => route.path)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/mist'),
        expect.stringContaining('/api/chan'),
      ]),
    );
  });
});
