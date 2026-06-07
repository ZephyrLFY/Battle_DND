#include "pokeview.h"
#include "ui_pokeview.h"
#include "wideuse.h"

pokeView::pokeView(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::pokeView)
{
    ui->setupUi(this);
    connect(this,SIGNAL(getPoke(QList<QString> &)),udpthread,SLOT(getPoke(QList<QString>&)));
    connect(udpthread,SIGNAL(allpoke(QList<QString>&)),this,SLOT(updateTable(QList<QString>&)));
    getpoke();
}

pokeView::~pokeView()
{
    disconnect(this,SIGNAL(getPoke(QList<QString> &)),udpthread,SLOT(getPoke(QList<QString>&)));
    disconnect(udpthread,SIGNAL(allpoke(QList<QString>&)),this,SLOT(updateTable(QList<QString>&)));
    pokeModel->clear();
    delete pokeModel;
    delete ui;
}

void pokeView::getpoke()
{
    QList<QString> text;
    text << "6" << localUser->getName();
    emit getPoke(text);
}

void pokeView::updateTable(QList<QString> &pokeInfo)
{
    qint32 i = 0;
    rowNum = pokeInfo.count("line");
    pokeModel = new QStandardItemModel(this);
    pokeModel->setColumnCount(2);
    pokeModel->setRowCount(rowNum);
    pokeModel->setHeaderData(0,Qt::Horizontal,"精灵名");
    pokeModel->setHeaderData(1,Qt::Horizontal,"等级");
    for(qint32 row = 0; row < rowNum; row++)
    {
        for(qint32 col = 0; col < 2; col++)
        {
            if(pokeInfo.at(i) == "line")
                i++;
            QStandardItem *item = new QStandardItem(pokeInfo.at(i));
            pokeModel->setItem(row,col,item);
            i++;
        }
    }
    ui->pokeInfo->setModel(pokeModel);
    ui->pokeInfo->setEditTriggers(QAbstractItemView::NoEditTriggers);
    ui->pokeInfo->verticalHeader()->setVisible(false);
    ui->pokeInfo->resizeColumnsToContents();
    ui->pokeInfo->setSelectionMode(QAbstractItemView::ExtendedSelection);
    ui->pokeInfo->setSelectionBehavior(QAbstractItemView::SelectItems);
}
