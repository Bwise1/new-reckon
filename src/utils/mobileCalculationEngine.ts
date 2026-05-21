export interface MaterialCalcItemInput {
    values: Record<string, string>;
    isADeduct?: boolean;
}

export interface BoqCalcGroupInput {
    expressions: string[];
    isADeduct?: boolean;
}

export interface MaterialResultLine {
    name: string;
    unit: string;
    multiplier: number;
    value: number;
}

export interface MaterialResultSpecLike {
    name: string;
    unit: string;
    multiplier: number;
}

/**
 * Mirrors the Flutter mobile parser in `lib/utils/functions/calculations.dart`.
 */
export const calculateExpressionMobileCompat = (expression: string): number => {
    if (!expression.trim()) return 0;

    const precedence = (operator: string): number => {
        if (operator === "+" || operator === "-") return 1;
        if (operator === "*" || operator === "/") return 2;
        if (operator === "√") return 3;
        return 0;
    };

    const applyOperator = (operator: string, b: number, a?: number): number => {
        switch (operator) {
            case "+":
                return (a ?? 0) + b;
            case "-":
                return (a ?? 0) - b;
            case "*":
                return (a ?? 0) * b;
            case "/":
                return (a ?? 0) / b;
            case "√":
                return Math.sqrt(b);
            default:
                throw new Error(`Invalid operator: ${operator}`);
        }
    };

    const numbers: number[] = [];
    const operators: string[] = [];

    const consumeOperator = () => {
        const operator = operators.pop();
        if (!operator) return;
        const b = numbers.pop();
        if (typeof b !== "number") {
            throw new Error("Invalid expression: missing right operand");
        }
        const a = numbers.length > 0 ? numbers.pop() : undefined;
        numbers.push(applyOperator(operator, b, a));
    };

    let i = 0;
    while (i < expression.length) {
        const char = expression[i];
        if (char === " ") {
            i += 1;
            continue;
        }

        if (/[0-9]/.test(char)) {
            let token = "";
            while (i < expression.length && /[0-9.]/.test(expression[i])) {
                token += expression[i];
                i += 1;
            }
            numbers.push(Number.parseFloat(token));
            continue;
        }

        if (char === "√") {
            operators.push(char);
            i += 1;
            continue;
        }

        if (char === "(") {
            operators.push(char);
            i += 1;
            continue;
        }

        if (char === ")") {
            while (operators.length > 0 && operators[operators.length - 1] !== "(") {
                consumeOperator();
            }
            if (operators[operators.length - 1] === "(") {
                operators.pop();
            }
            i += 1;
            continue;
        }

        if (/[+\-*/]/.test(char)) {
            while (
                operators.length > 0 &&
                precedence(operators[operators.length - 1]) >= precedence(char)
            ) {
                consumeOperator();
            }
            operators.push(char);
            i += 1;
            continue;
        }

        throw new Error(`Invalid character: ${char}`);
    }

    while (operators.length > 0) {
        consumeOperator();
    }

    return numbers[numbers.length - 1] ?? 0;
};

export const calculateItemProduct = (values: Record<string, string>): number => {
    let multipliedValue = 0;

    Object.values(values).forEach((value) => {
        multipliedValue =
            (multipliedValue === 0 ? 1 : multipliedValue) *
            calculateExpressionMobileCompat(value);
    });

    return multipliedValue;
};

export const calculateBaseFromItems = (items: MaterialCalcItemInput[]): number => {
    return items.reduce((base, item) => {
        const itemProduct = calculateItemProduct(item.values);
        return item.isADeduct ? base - itemProduct : base + itemProduct;
    }, 0);
};

/**
 * Mirrors mobile BOQ behavior in `SelectedSection._calculateMeasurement`:
 * each group's expressions are multiplied together; groups are added or deducted.
 */
export const calculateBoqQuantityFromGroups = (groups: BoqCalcGroupInput[]): number => {
    return groups.reduce((total, group) => {
        const groupResult = group.expressions.reduce((product, expression) => {
            return product * calculateExpressionMobileCompat(expression);
        }, 1);

        return group.isADeduct ? total - groupResult : total + groupResult;
    }, 0);
};

export const calculateResultLines = (
    base: number,
    specs: MaterialResultSpecLike[],
): MaterialResultLine[] => {
    return specs.map((spec) => ({
        ...spec,
        value: spec.multiplier * base,
    }));
};

