
#include "includes.h"


void fus_parser_init(fus_parser_t *parser, fus_vm_t *vm){
    parser->vm = vm;
    fus_array_init(&parser->stack, &vm->class_array);
    fus_array_init(&parser->values, &vm->class_value);
}

void fus_parser_cleanup(fus_parser_t *parser){
    fus_array_cleanup(&parser->stack);
    fus_array_cleanup(&parser->values);
}

void fus_parser_fprint(fus_parser_t *parser, FILE *file){
    /* TODO */
    fprintf(file, "<PARSER>");
}

void fus_parser_print(fus_parser_t *parser){
    fus_parser_fprint(parser, stdout);
}

void fus_parser_parse_token(fus_parser_t *parser,
    const char *token, int token_len
){
    /* TODO */
}

void fus_parser_parse_token_simple(fus_parser_t *parser,
    const char *token
){
    fus_parser_parse_token(parser, token, strlen(token));
}

