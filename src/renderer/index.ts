type Point2D = [number, number];
type Vector3 = [number, number, number];

type RGB = [number, number, number];
type Sphere = {
  C: Vector3;
  r: number;
  color: RGB;
  specular: number;
};

type AmbientLight = {
  type: "ambient";
  intensity: number;
};

type PointLight = {
  type: "point";
  intensity: number;
  position: Vector3;
};

type DirectionalLight = {
  type: "directional";
  intensity: number;
  direction: Vector3;
};

type Light = AmbientLight | PointLight | DirectionalLight;

type Scene = {
  spheres: Sphere[];
  lights: Light[];
};
type ClosestIntersection = {
  closestIntersection: Sphere | null;
  closestT: number;
};
export class Renderer {
  private scene: Scene = {
    spheres: [
      {
        C: [0, -1, 3],
        r: 1,
        color: [255, 0, 0],
        specular: 500,
      },
      {
        C: [2, 0, 4],
        r: 1,
        color: [0, 0, 255],
        specular: 500,
      },
      {
        C: [-2, 0, 4],
        r: 1,
        color: [0, 255, 0],
        specular: 10,
      },
      {
        C: [0, -5001, 0],
        r: 5000,
        color: [255, 255, 0],
        specular: 1000,
      },
    ],
    lights: [
      { type: "ambient", intensity: 0.2 },
      { type: "point", intensity: 0.6, position: [2, 1, 0] },
      { type: "directional", intensity: 0.2, direction: [1, 4, 4] },
    ],
  };
  private vw = 1;
  private vh = 1;
  private vd = 1;

  private backgroundColor: RGB = [255, 255, 255];
  private imageData: ImageData;

  static create(canvas: HTMLCanvasElement): Renderer {
    const ctx = canvas.getContext("2d");

    if (ctx == null) {
      throw new Error("context is null");
    }

    return new Renderer(canvas, ctx);
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    private context: CanvasRenderingContext2D
  ) {
    this.imageData = new ImageData(this.canvas.width, this.canvas.height);
  }

  render() {
    const O: Vector3 = [0, 0, 0]; // camera
    const [cw, ch] = [this.canvas.width, this.canvas.height];

    // iterate canvas
    for (let x = -cw / 2; x < cw / 2; x++) {
      for (let y = -ch / 2; y < ch / 2; y++) {
        // map canvas pixel to viewport point (3D plane in scene)
        const D = this.canvasToViewport(x, y);
        const color = this.traceRay(O, D, 1, Infinity);
        this.putPixel(x, y, color);
      }
    }
    this.putImageData();
  }

  canvasToViewport(x: number, y: number): Vector3 {
    const [cw, ch] = [this.canvas.width, this.canvas.height];
    const D: Vector3 = [(x * this.vw) / cw, (y * this.vh) / ch, this.vd];

    return D;
  }

  traceRay(
    origin: Vector3,
    viewportPoint: Vector3,
    tMin: number,
    tMax: number
  ) {
    let { closestIntersection: closestSphere, closestT }: ClosestIntersection =
      this.closestIntersection(origin, viewportPoint, tMin, tMax);

    if (closestSphere == null) {
      return this.backgroundColor;
    }

    const intersection = this.add(
      origin,
      this.multiplyByScalar(viewportPoint, closestT)
    ) as Vector3;

    let normal = this.subtract(intersection, closestSphere.C);
    normal = this.multiplyByScalar(normal, 1 / this.length(normal));

    return this.multiplyByScalar(
      closestSphere.color,
      this.computeLighting(
        intersection,
        normal,
        this.multiplyByScalar(viewportPoint, -1),
        closestSphere.specular
      )
    ) as RGB;
  }

  closestIntersection(
    origin: Vector3,
    viewportPoint: Vector3,
    tMin: number,
    tMax: number
  ): ClosestIntersection {
    let closestT = Infinity;
    let closestSphere: Sphere | null = null;

    for (let sphere of this.scene.spheres) {
      // ray can intersect sphere in 0, 1 or 2 points P1 = (O + t1D), P2 = (O + t2D)
      const intersects = this.intersectRaySphere(origin, viewportPoint, sphere);
      for (let t of intersects) {
        if (t > tMin && t < tMax && t < closestT) {
          closestT = t;
          closestSphere = sphere;
        }
      }
    }
    return { closestIntersection: closestSphere, closestT };
  }

  intersectRaySphere(
    origin: Vector3,
    viewportPoint: Vector3,
    sphere: Sphere
  ): [number, number] {
    // solve quadratic equasion
    const co = origin.map((p, i) => p - sphere.C[i]) as Vector3;

    const a = this.dot(viewportPoint, viewportPoint);
    const b = this.dot(co, viewportPoint) * 2;
    const c = this.dot(co, co) - sphere.r * sphere.r;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return [Infinity, Infinity];
    }

    const t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b - Math.sqrt(discriminant)) / (2 * a);

    return [t1, t2];
  }

  computeLighting(point: Vector3, normal: Vector3, v: Vector3, s: number) {
    let i = 0.0; // base intensity

    for (let light of this.scene.lights) {
      if (light.type == "ambient") {
        i += light.intensity;
        continue;
      }

      // light direction
      let L: Vector3;
      let [tMin, tMax] = [0.001, 1];
      if (light.type == "point") {
        // vector from point to light position
        L = this.subtract(light.position, point);
      } else {
        // simply light direction
        L = light.direction;
        tMax = Infinity;
      }

      // shadow
      const { closestIntersection } = this.closestIntersection(
        point,
        L as Vector3,
        tMin,
        tMax
      );

      if (closestIntersection != null) {
        continue;
      }

      const nDotL = this.dot(normal, L);
      if (nDotL > 0) {
        // intensity of diffused light depends on the angle
        i += (light.intensity * nDotL) / (this.length(normal) * this.length(L));
      }

      if (s != -1) {
        const R = this.subtract(this.multiplyByScalar(normal, 2 * nDotL), L);
        const rDotV = this.dot(R, v);
        if (rDotV > 0) {
          i +=
            light.intensity *
            Math.pow(rDotV / (this.length(R) * this.length(v)), s);
        }
      }
    }

    return i;
  }

  dot(v1: Vector3, v2: Vector3): number {
    if (v1.length != v2.length) {
      throw new Error("[dot]: vectors have different length");
    }
    return v1.map((p, i) => p * v2[i]).reduce((acc, v) => acc + v, 0);
  }

  add(v1: Vector3, v2: Vector3): Vector3 {
    if (v1.length != v2.length) {
      throw new Error("[add]: vectors have different length");
    }
    return v1.map((p, i) => p + v2[i]) as Vector3;
  }

  subtract(v1: Vector3, v2: Vector3): Vector3 {
    if (v1.length != v2.length) {
      throw new Error("[subtract]: vectors have different length");
    }
    return v1.map((p, i) => p - v2[i]) as Vector3;
  }

  subtractScalar(v1: Vector3, a: number) {
    return v1.map((p) => p - a);
  }

  multiplyByScalar(v1: Vector3, a: number): Vector3 {
    return v1.map((p) => p * a) as Vector3;
  }

  length(v1: Vector3): number {
    return Math.sqrt(v1.reduce((acc, v) => acc + v * v, 0));
  }

  putPixel(cx: number, cy: number, [R, G, B]: RGB) {
    const sx = this.canvas.width / 2 + cx;
    const sy = this.canvas.height / 2 - cy;

    const index = 4 * (sy * this.canvas.width + sx);

    this.imageData.data[index + 0] = Math.min(R, 255);
    this.imageData.data[index + 1] = Math.min(G, 255);
    this.imageData.data[index + 2] = Math.min(B, 255);
    this.imageData.data[index + 3] = 255;
  }

  putImageData() {
    this.context.putImageData(this.imageData, 0, 0);
  }

  clear() {
    this.imageData = new ImageData(this.canvas.width, this.canvas.height);

    this.context.putImageData(
      new ImageData(this.canvas.width, this.canvas.height),
      0,
      0
    );
  }
}
