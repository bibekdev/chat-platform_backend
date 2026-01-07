import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodDto, ZodValidationPipe } from 'nestjs-zod';
import { ZodError, ZodType } from 'zod';

@Injectable()
export class GlobalZodValidationPipe extends ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const { metatype } = metadata;

    if (metatype && (metatype as any).schema) {
      const schema: ZodType = (metatype as unknown as ZodDto<any>).schema;
      return this.parseWithSchema(value, schema);
    }

    if (metatype && (metatype as any)._def) {
      return this.parseWithSchema(value, metatype as unknown as ZodType);
    }

    return value;
  }

  private parseWithSchema(value: unknown, schema: ZodType) {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        errors: this.formatErrors(result.error),
      });
    }

    return result.data;
  }

  private formatErrors(error: ZodError) {
    const formatted: Record<string, string[]> = {};
    error.issues.forEach(err => {
      const field = err.path.join('.') || 'root';
      if (!formatted[field]) {
        formatted[field] = [];
      }
      formatted[field].push(err.message);
    });
    return formatted;
  }
}
