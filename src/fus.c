
#include "includes.h"

void fus_init(fus_t *fus){
    fus_core_init(&fus->core);
    fus_lexer_init(&fus->lexer, NULL);
    fus_symtable_init(&fus->symtable, &fus->core, true);
    fus_vm_init(&fus->vm, &fus->core, &fus->symtable);
    fus_parser_init(&fus->parser, &fus->vm);
    fus_runner_init(&fus->runner, &fus->vm);
    fus_printer_init(&fus->printer);
}

void fus_cleanup(fus_t *fus){
    fus_printer_cleanup(&fus->printer);
    fus_runner_cleanup(&fus->runner);
    fus_parser_cleanup(&fus->parser);
    fus_vm_cleanup(&fus->vm);
    fus_symtable_cleanup(&fus->symtable);
    fus_lexer_cleanup(&fus->lexer);
    fus_core_cleanup(&fus->core);
}


int fus_run_text(fus_t *fus, const char *text){

    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    fus_runner_t *runner = &fus->runner;
    if(fus_runner_exec_lexer(runner, lexer, false) < 0)return -1;

    if(!fus_lexer_is_done(lexer)){
        fus_lexer_perror(lexer, "Lexer finished with status != done");
        return -1;
    }

    return 0;
}
