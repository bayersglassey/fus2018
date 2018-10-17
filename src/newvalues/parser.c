
#include "includes.h"


void fus_parser_init(fus_parser_t *parser, fus_vm_t *vm){}
void fus_parser_cleanup(fus_parser_t *parser){}
void fus_parser_printf(fus_parser_t *parser, FILE *file){}
void fus_parser_print(fus_parser_t *parser){}

void fus_parser_parse_token(fus_parser_t *parser,
    const char *token, int token_len){}
void fus_parser_parse_token_simple(fus_parser_t *parser,
    const char *token){}

