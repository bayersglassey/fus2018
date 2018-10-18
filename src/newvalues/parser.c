
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

void fus_parser_fprint(fus_parser_t *parser, FILE *file){
    /* TODO */
    fprintf(file, "<PARSER>");
}

void fus_parser_print(fus_parser_t *parser){
    fus_parser_fprint(parser, stdout);
}



void fus_parser_push_arr(fus_parser_t *parser){}
void fus_parser_pop_arr(fus_parser_t *parser){}


void fus_parser_stringparse_name(fus_parser_t *parser, const char *string){
    fus_parser_tokenparse_name(parser, string, strlen(string));
}
void fus_parser_stringparse_op(fus_parser_t *parser, const char *string){
    fus_parser_tokenparse_name(parser, string, strlen(string));
}
void fus_parser_stringparse_int(fus_parser_t *parser, const char *string){
    fus_parser_tokenparse_name(parser, string, strlen(string));
}
void fus_parser_stringparse_str(fus_parser_t *parser, const char *string){
    fus_parser_tokenparse_name(parser, string, strlen(string));
}


void fus_parser_tokenparse_name(fus_parser_t *parser,
    const char *token, int token_len
){
}
void fus_parser_tokenparse_op(fus_parser_t *parser,
    const char *token, int token_len
){
}
void fus_parser_tokenparse_int(fus_parser_t *parser,
    const char *token, int token_len
){
}
void fus_parser_tokenparse_str(fus_parser_t *parser,
    const char *token, int token_len
){
}

