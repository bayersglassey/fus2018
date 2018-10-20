
#include "includes.h"


void fus_parser_init(fus_parser_t *parser, fus_vm_t *vm){
    parser->vm = vm;
    fus_array_init(&parser->arr_stack, &vm->class_arr);
    fus_arr_init(&parser->arr, vm);
}

void fus_parser_cleanup(fus_parser_t *parser){
    fus_array_cleanup(&parser->arr_stack);
    fus_arr_cleanup(&parser->arr);
}

void fus_parser_dump(fus_parser_t *parser, FILE *file){
    /* TODO */
    fprintf(file, "PARSER:\n");
    fprintf(file, "  arr_stack length: %i\n", parser->arr_stack.len);

    fprintf(file, "  values:\n");
    fprintf(file, "    ");
    {
        fus_printer_t printer;
        fus_printer_init(&printer, file);
        printer.depth = 2;

        fus_printer_print_data(&printer, parser->vm, &parser->arr);

        fus_printer_cleanup(&printer);
    }
    fprintf(file, "\n");
}



void fus_parser_push_arr(fus_parser_t *parser){
    /* Push parser->arr onto arr_stack */
    /* TODO: This should all be taken care of by fus_array_push */
    fus_array_push(&parser->arr_stack);
    fus_arr_t *arr_stack_last = FUS_ARRAY_GET_REF(parser->arr_stack,
        parser->arr_stack.len - 1);
    *arr_stack_last = parser->arr;

    /* Initialize parser->arr to a fresh arr */
    fus_arr_init(&parser->arr, parser->vm);
}
void fus_parser_pop_arr(fus_parser_t *parser){
    /* Wrap parser->arr into an arr value */
    fus_value_t value_arr = fus_value_arr_from_arr(parser->vm, &parser->arr);

    /* Pop from parser->arr_stack into parser->arr */
    /* TODO: This should all be taken care of by fus_array_pop */
    fus_arr_t *arr_stack_last = FUS_ARRAY_GET_REF(parser->arr_stack,
        parser->arr_stack.len - 1);
    parser->arr = *arr_stack_last;
    fus_array_pop(&parser->arr_stack);

    /* Push arr value onto parser->arr */
    fus_arr_push(&parser->arr, value_arr);
}
void fus_parser_push_value(fus_parser_t *parser, fus_value_t value){
    fus_arr_push(&parser->arr, value);
}



#define FUS_PARSER_DEFS(T) \
    fus_value_t fus_value_stringparse_##T(fus_vm_t *vm, const char *token){ \
        return fus_value_tokenparse_##T(vm, token, strlen(token)); \
    } \
    void fus_parser_stringparse_##T(fus_parser_t *parser, const char *token){ \
        fus_parser_tokenparse_##T(parser, token, strlen(token)); \
    } \
    void fus_parser_tokenparse_##T(fus_parser_t *parser, \
        const char *token, int token_len \
    ){ \
        fus_value_t value = fus_value_tokenparse_##T(parser->vm, \
            token, token_len); \
        fus_parser_push_value(parser, value); \
    }

FUS_PARSER_DEFS(int)
FUS_PARSER_DEFS(sym)
FUS_PARSER_DEFS(str)

fus_value_t fus_value_tokenparse_int(fus_vm_t *vm,
    const char *token, int token_len
){
    fus_unboxed_t result = 0;
    bool neg = token[0] == '-';
    for(int i = neg? 1: 0; i < token_len; i++){
        fus_unboxed_t digit = token[i] - '0';
        fus_unboxed_t max = FUS_UNBOXED_MAX - digit / 10;
        if(result > max){
            return fus_value_err(vm,
                neg? FUS_ERR_UNDERFLOW: FUS_ERR_OVERFLOW);
        }
        result = result * 10 + digit;
    }
    if(neg)result = -result;
        /* TODO: Can flipping sign cause underflow/overflow? */
    return fus_value_int(vm, result);
}

fus_value_t fus_value_tokenparse_sym(fus_vm_t *vm,
    const char *token, int token_len
){
    int sym_i = fus_symtable_get_or_add_from_token(vm->symtable,
        token, token_len);
    return fus_value_sym(vm, sym_i);
}

fus_value_t fus_value_tokenparse_str(fus_vm_t *vm,
    const char *token, int token_len
){
    /* TODO */
    fprintf(stderr, "TODO: Implement str values\n");
    return fus_value_int(vm, 10101010);
}

